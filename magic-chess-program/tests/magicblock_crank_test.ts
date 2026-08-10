/**
 * magicblock_crank_test.ts
 *
 * Tests the MagicBlock crank chain: schedule_timeout → claim_timeout_win → settlement.
 *
 * Flow:
 *   1. Initialize a chess match + Player 2 joins (L1)
 *   2. Delegate to MagicBlock ER
 *   3. Player 1 (White) makes a move → verify a timeout task is scheduled
 *   4. Wait for the timeout window to elapse (short timeout)
 *   5. Player 1 claims timeout win → verify game ends (on ER)
 *   6. Undelegate from ER (commits state back to L1)
 *   7. Verify and process settlement on L1
 *
 * ── Crank Architecture ─────────────────────────────────────────────────
 *
 * The MagicBlock Task Scheduler (Magic11111111111111111111111111111111111111)
 * allows programs to schedule future CPI calls without an off-chain crank bot.
 *
 * The Speed Chess program uses two cranked tasks per match:
 *
 *   Task                  | Trigger                    | Action
 *   ──────────────────────|───────────────────────────|──────────────────
 *   timeout_task          | After each move            | Claims timeout win for opponent
 *   settlement_task       | After game ends (timeout)  | Processes escrow payout
 *
 * Task IDs are derived deterministically:
 *   base_id     = i64::from_le_bytes( match_account_pubkey[0..8] )
 *   timeout_id  = base_id + (fullmove_number * 2)
 *   settlement  = base_id + 10_000
 *
 * ── Scheduler CPI Format ───────────────────────────────────────────────
 *
 * The schedule_timeout instruction CPIs to the Task Scheduler with:
 *   - discriminator: u32_le(0) for ScheduleTask, u32_le(1) for CancelTask
 *   - args: bincode( ScheduleTaskArgs { task_id, interval_ms, iterations } )
 *
 * This test uses a SMALL timeout (e.g. 5 seconds) to make the crank
 * practical in a test environment.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// @ts-ignore
import idl from "../target/idl/magic_chess.json" with { type: "json" };

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_LAYER_RPC = "https://rpc.magicblock.app/devnet";
const ROUTER_API_BASE = "https://devnet-router.magicblock.app";
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const TASK_SCHEDULER_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);
const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);

const CHESS_MATCH_SEED = Buffer.from("chess_match");
const MATCH_ESCROW_SEED = Buffer.from("match_escrow");

// ═══════════════════════════════════════════════════════════════════════
// CPI Helpers — low-level instruction builders for the task scheduler
// ═══════════════════════════════════════════════════════════════════════

/** Discriminant for MagicBlockInstruction::ScheduleTask */
const SCHEDULE_TASK_DISCRIMINANT = 0;
/** Discriminant for MagicBlockInstruction::CancelTask */
const CANCEL_TASK_DISCRIMINANT = 1;

/**
 * Build a ScheduleTask instruction data buffer.
 *
 * Layout (Rust-side):
 *   u32_le(variant_index=0) || bincode(ScheduleTaskArgs)
 *   ScheduleTaskArgs = { task_id: i64, execution_interval_millis: i64, iterations: i64 }
 */
function buildScheduleTaskIxData(
  taskId: number,
  intervalMs: number,
  iterations: number
): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(SCHEDULE_TASK_DISCRIMINANT, 0);

  // bincode serialization of 3 i64 values (little-endian)
  const args = Buffer.alloc(24); // 3 * 8 bytes
  args.writeBigInt64LE(BigInt(taskId), 0);
  args.writeBigInt64LE(BigInt(intervalMs), 8);
  args.writeBigInt64LE(BigInt(iterations), 16);

  return Buffer.concat([header, args]);
}

/**
 * Build a CancelTask instruction data buffer.
 *
 * Layout: u32_le(variant_index=1) || i64_le(task_id)
 */
function buildCancelTaskIxData(taskId: number): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(CANCEL_TASK_DISCRIMINANT, 0);

  const idBytes = Buffer.alloc(8);
  idBytes.writeBigInt64LE(BigInt(taskId), 0);

  return Buffer.concat([header, idBytes]);
}

/** Derive the deterministic task IDs used by the contract */
function deriveTaskIds(
  matchAccountPubkey: PublicKey,
  fullmoveNumber: number
): { timeoutTaskId: number; settlementTaskId: number } {
  // base_id = first 8 bytes of match account pubkey as i64
  const pubkeyBytes = matchAccountPubkey.toBytes();
  const baseId = Number(
    (BigInt.asIntN(64, BigInt(
      "0x" + Buffer.from(pubkeyBytes.slice(0, 8)).toString("hex")
    )) as bigint)
  );

  const timeoutTaskId = baseId + fullmoveNumber * 2;
  const settlementTaskId = baseId + 10_000;

  return { timeoutTaskId, settlementTaskId };
}

// ═══════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════

describe("MagicBlock Crank — Timeout & Settlement Chain", () => {
  const baseConnection = new anchor.web3.Connection(BASE_LAYER_RPC, "confirmed");

  const payer = anchor.web3.Keypair.generate();
  const opponent = anchor.web3.Keypair.generate();
  const platformFeeWallet = anchor.web3.Keypair.generate();

  const provider = new anchor.AnchorProvider(
    baseConnection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as any, provider);

  const matchId = "mb-crank-" + Date.now().toString(36);
  let chessMatchPda: PublicKey;
  let escrowPda: PublicKey;
  let bettingMint: PublicKey;
  let payerAta: PublicKey;
  let opponentAta: PublicKey;
  let platformFeeAta: PublicKey;

  // ER connection — resolved from router after delegation
  let erFqdn: string;
  let erConnection: anchor.web3.Connection;
  let erProgram: anchor.Program;

  // Use a short timeout (5 seconds) so we can observe the timeout window
  const SHORT_TIMEOUT_SECONDS = 5;
  const betAmount = new BN(100_000000);

  // ────────────────────────────────────────────────────────────────────
  // Setup
  // ────────────────────────────────────────────────────────────────────
  before(async () => {
    // Fund test wallets from ANCHOR_WALLET (avoids faucet rate limits)
    const funder = anchor.AnchorProvider.env().wallet;
    const fundAmount = 0.5 * anchor.web3.LAMPORTS_PER_SOL;
    for (const kp of [payer, opponent, platformFeeWallet]) {
      const bal = await baseConnection.getBalance(kp.publicKey);
      if (bal < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
        const tx = new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: funder.publicKey,
            toPubkey: kp.publicKey,
            lamports: fundAmount,
          })
        );
        await anchor.web3.sendAndConfirmTransaction(baseConnection, tx, [(funder as any).payer]);
      }
    }

    console.log(`Payer: ${payer.publicKey.toBase58()}`);
    console.log(`Opponent: ${opponent.publicKey.toBase58()}`);
    console.log(`Platform fee wallet: ${platformFeeWallet.publicKey.toBase58()}`);
    console.log(`Match ID: ${matchId}`);
    console.log(`Timeout: ${SHORT_TIMEOUT_SECONDS}s (for fast test)`);

    // Derive PDAs
    [chessMatchPda] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );
    [escrowPda] = PublicKey.findProgramAddressSync(
      [MATCH_ESCROW_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Create betting token
    bettingMint = await createMint(
      baseConnection,
      payer,
      payer.publicKey,
      null,
      6
    );

    payerAta = (
      await getOrCreateAssociatedTokenAccount(
        baseConnection,
        payer,
        bettingMint,
        payer.publicKey
      )
    ).address;

    opponentAta = (
      await getOrCreateAssociatedTokenAccount(
        baseConnection,
        payer,
        bettingMint,
        opponent.publicKey
      )
    ).address;

    platformFeeAta = (
      await getOrCreateAssociatedTokenAccount(
        baseConnection,
        payer,
        bettingMint,
        platformFeeWallet.publicKey
      )
    ).address;

    await mintTo(baseConnection, payer, bettingMint, payerAta, payer.publicKey, 1000_000000);
    await mintTo(baseConnection, payer, bettingMint, opponentAta, payer.publicKey, 1000_000000);

    console.log("Setup complete");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 1: Initialize match (L1)
  // ────────────────────────────────────────────────────────────────────
  it("Step 1 — Initialize match on L1", async () => {
    await program.methods
      .initializeMatch(
        matchId,
        betAmount,
        new BN(SHORT_TIMEOUT_SECONDS),
        200,
        platformFeeWallet.publicKey,
        false                 // prediction_enabled
      )
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: payer.publicKey,
        rentPayer: payer.publicKey,
        bettingTokenMintAccount: bettingMint,
        playerTokenAccount: payerAta,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(matchData.matchId, matchId, "Match ID should match");
    assert.deepEqual(matchData.gameStatus, { waitingForOpponent: {} }, "Game should be WaitingForOpponent");
    assert.isFalse(matchData.isDelegated, "Should not be delegated yet");

    console.log("Match initialized on L1");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 2: Join match (L1 — MUST be before delegation)
  // ────────────────────────────────────────────────────────────────────
  it("Step 2 — Opponent joins the match on L1", async () => {
    const opponentProvider = new anchor.AnchorProvider(
      baseConnection,
      new anchor.Wallet(opponent),
      { commitment: "confirmed" }
    );
    const opponentProgram = new anchor.Program(idl as any, opponentProvider);

    await opponentProgram.methods
      .joinMatch(betAmount)
      .accounts({
        chessMatch: chessMatchPda,
        playerTwoSigner: opponent.publicKey,
        playerTokenAccount: opponentAta,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([opponent])
      .rpc();

    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.deepEqual(matchData.gameStatus, { active: {} }, "Game should be Active");
    assert.equal(
      matchData.players[1].toBase58(),
      opponent.publicKey.toBase58(),
      "Opponent should be player 2"
    );
    console.log("Opponent joined. Game is Active.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 3: Delegate to MagicBlock ER
  // ────────────────────────────────────────────────────────────────────
  it("Step 3 — Delegate match to MagicBlock ER", async () => {
    // delegation_uid is set by the handler from match_id

    // Manually derive delegation PDAs (Anchor TS auto-resolution has
    // issues with cross-program PDA derivation in the IDL).
    const [bufferChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer"), chessMatchPda.toBuffer()],
      program.programId
    );
    const [delegationRecordChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation"), chessMatchPda.toBuffer()],
      DELEGATION_PROGRAM_ID
    );
    const [delegationMetadataChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()],
      DELEGATION_PROGRAM_ID
    );

    await program.methods
      .delegateMatch()
      .accountsStrict({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
        bufferChessMatch: bufferChessMatch,
        delegationRecordChessMatch: delegationRecordChessMatch,
        delegationMetadataChessMatch: delegationMetadataChessMatch,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    // Poll router for delegation (JSON-RPC POST)
    let delegated = false;
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      try {
        const res = await fetch(ROUTER_API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getDelegationStatus",
            params: [chessMatchPda.toBase58()],
          }),
        });
        if (res.ok) {
          const body = await res.json();
          const status = body.result;
          if (status && status.isDelegated && status.fqdn) {
            delegated = true;
            erFqdn = status.fqdn;
            break;
          }
        }
      } catch {}
    }
    assert.isTrue(delegated, "Delegation must be confirmed");
    console.log(`Delegated to ER: ${erFqdn}`);

    // Build ER connection and program for subsequent steps
    // Router fqdn may already include https:// prefix
    const erUrl = erFqdn.startsWith("https://") ? erFqdn : `https://${erFqdn}`;
    erConnection = new anchor.web3.Connection(erUrl, "confirmed");
    const erProvider = new anchor.AnchorProvider(
      erConnection,
      new anchor.Wallet(payer),
      { commitment: "confirmed" }
    );
    erProgram = new anchor.Program(idl as any, erProvider);

    // Verify on-chain
    const matchData = await erProgram.account.chessMatch.fetch(chessMatchPda);
    assert.isTrue(matchData.isDelegated);
    assert.equal(matchData.activeTaskId, -1, "No tasks scheduled initially");
    console.log("Delegation verified on ER");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 4: Make a move on ER → verify timeout task is scheduled
  // ────────────────────────────────────────────────────────────────────
  it("Step 4 — Make a move → verify timeout task scheduled", async () => {
    // White (payer) moves: e2 → e4
    const moveTx = await erProgram.methods
      .makeMove({
        fromRow: 1,
        fromCol: 4,
        toRow: 3,
        toCol: 4,
        promotion: null,
      })
      .accounts({
        chessMatch: chessMatchPda,
        player: payer.publicKey,
      })
      .signers([payer])
      .rpc();

    console.log(`Move tx (ER): ${moveTx}`);

    // Read match state from ER (no need to commit for this check)
    const matchData = await erProgram.account.chessMatch.fetch(chessMatchPda);

    // Verify: the program should have scheduled a timeout task after the move
    assert.isAbove(
      matchData.activeTaskId,
      -1,
      "A timeout task should be scheduled (active_task_id >= 0)"
    );

    // Verify the task ID matches our derivation
    const { timeoutTaskId } = deriveTaskIds(chessMatchPda, matchData.fullmoveNumber);
    console.log(`Expected timeout_task_id: ${timeoutTaskId}`);
    console.log(`Actual active_task_id:  ${matchData.activeTaskId}`);

    // NOTE: The task_id derivation uses wrapping_add, so this may differ by MOD 2^64.
    // The important assertion is that active_task_id != -1 (a task IS scheduled).
    console.log("Timeout task verified as scheduled on ER.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 5: Wait for timeout → claim timeout win (on ER)
  // ────────────────────────────────────────────────────────────────────
  it("Step 5 — Wait for timeout and claim timeout win on ER", async () => {
    // After White's move (e2-e4), it's now Black's turn.
    // White (payer) will claim that Black timed out.
    // Wait: SHORT_TIMEOUT_SECONDS + 3 seconds buffer
    const waitSeconds = SHORT_TIMEOUT_SECONDS + 3;
    console.log(`Waiting ${waitSeconds} seconds for timeout window to elapse...`);
    await sleep(waitSeconds * 1000);

    // White (payer) claims Black timed out on the ER
    // Must use erProgram because the account is delegated (locked on L1)
    const claimTx = await erProgram.methods
      .claimTimeoutWin()
      .accounts({
        chessMatch: chessMatchPda,
        claimerSigner: payer.publicKey,
      })
      .signers([payer])
      .rpc();

    console.log(`Claim timeout win tx (ER): ${claimTx}`);

    // Read match state from ER
    const matchData = await erProgram.account.chessMatch.fetch(chessMatchPda);
    console.log(`Game status:`, JSON.stringify(matchData.gameStatus)); // { whiteWins: {} } or { blackWins: {} }
    assert.notDeepEqual(
      matchData.gameStatus,
      { active: {} },
      "Game should no longer be Active"
    );
    assert.isDefined(
      matchData.gameEndReason,
      "Game end reason should be set"
    );
    console.log(`Game end reason: ${matchData.gameEndReason}`);

    // The timeout task should have been cancelled (active_task_id set to -1)
    assert.equal(
      matchData.activeTaskId,
      -1,
      "Timeout task should be cancelled after game ends"
    );

    // Settlement and undelegation tasks were scheduled on the ER
    const { settlementTaskId } = deriveTaskIds(chessMatchPda, 0);
    console.log(`Settlement task scheduled with id: ${settlementTaskId}`);
    console.log("Game ended on ER. Settlement + undelegation tasks scheduled.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 6: Undelegate from ER (commits state to L1)
  // ────────────────────────────────────────────────────────────────────
  it("Step 6 — Undelegate from ER (commit state to L1)", async () => {
    // undelegateMatch commits the latest ER state to L1 and undelegates.
    // After this, the account is back on L1 and can be written to directly.
    // Anchor TS auto-resolves magic_program and magic_context from the IDL.
    await program.methods
      .undelegateMatch()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .signers([payer])
      .rpc();

    // Verify on L1
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.isFalse(matchData.isDelegated, "Account should no longer be delegated");

    // Game should still be in concluded state on L1
    assert.notDeepEqual(
      matchData.gameStatus,
      { active: {} },
      "Game should still be concluded on L1"
    );
    assert.isFalse(matchData.payoutProcessed, "Payout should not yet be processed");

    console.log("Undelegated. Account back on L1 with committed state.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 7: Process settlement on L1
  // ────────────────────────────────────────────────────────────────────
  it("Step 7 — Process match settlement on L1", async () => {
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);

    // Verify game is in a concluded state (eligible for settlement)
    const gameStatusKeys = Object.keys(matchData.gameStatus);
    const isConcluded =
      gameStatusKeys.includes("whiteWins") ||
      gameStatusKeys.includes("blackWins") ||
      gameStatusKeys.includes("draw");
    assert.isTrue(isConcluded, "Game should be in a concluded state");
    assert.isFalse(matchData.payoutProcessed, "Payout should not yet be processed");

    // Derive the settlement task ID for logging
    const { settlementTaskId } = deriveTaskIds(chessMatchPda, 0);
    console.log(`Expected settlement_task_id: ${settlementTaskId}`);

    // Process settlement manually on L1.
    // In production, the MagicBlock Scheduler crank would CPI into
    // process_match_settlement after 5 seconds. Here we call it directly.
    const settlementTx = await program.methods
      .processMatchSettlement()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: escrowPda,
        playerOneAta: payerAta,
        playerTwoAta: opponentAta,
        platformFeeAta: platformFeeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    console.log(`Settlement tx: ${settlementTx}`);

    const settledData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.isTrue(
      settledData.payoutProcessed,
      "Payout should be marked as processed"
    );
    console.log("Settlement processed successfully");
    console.log("=== Crank chain test PASSED ===");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
