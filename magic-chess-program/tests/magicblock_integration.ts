/**
 * magicblock_integration.ts
 *
 * Full Ephemeral Rollup lifecycle test for the Magic Chess program.
 *
 * Flow:
 *   1. Initialize a chess match on devnet (base layer)
 *   2. Delegate the chess_match account to MagicBlock Ephemeral Rollups
 *   3. Verify delegation status via the MagicBlock Router API
 *   4. Make chess moves on the ER (fast confirmations)
 *   5. Commit state back to the base layer
 *   6. Undelegate the account
 *
 * ── MagicBlock Connection Routing ──────────────────────────────────────
 *
 * Three distinct endpoints are involved when working with MagicBlock ERs:
 *
 *   Endpoint          | URL                                        | Purpose
 *   ──────────────────|────────────────────────────────────────────|───────────
 *   Base Layer RPC    | https://rpc.magicblock.app/devnet          | Delegate, commit, undelegate txns
 *   Router API        | https://devnet-router.magicblock.app/      | Resolve ER fqdn, query delegation status
 *   ER Endpoint       | Derived from router getDelegationStatus    | Execute fast txns on the rollup
 *
 * Routing flow:
 *   1. Send delegate transaction to Base Layer RPC
 *   2. Poll router GET /delegation/{account} until status is "delegated"
 *   3. Extract `fqdn` from the delegate response (e.g. "er-abc123.devnet.magicblock.app")
 *   4. Construct ER RPC URL: https://{fqdn}
 *   5. All subsequent game moves are sent to the ER RPC for 200ms confirmations
 *   6. Commit + undelegate transactions go back to the Base Layer RPC
 *
 * ── Prerequisites ──────────────────────────────────────────────────────
 *
 *   npm install --save-dev \
 *     @coral-xyz/anchor \
 *     @solana/web3.js \
 *     @solana/spl-token \
 *     ts-mocha \
 *     typescript \
 *     mocha \
 *     chai
 *
 *   # Rebuild IDL to include MagicBlock instructions:
 *   anchor build
 *
 *   # Run with:
 *   anchor test --skip-build --skip-deploy tests/magicblock_integration.ts
 *
 * ── Account Notes ──────────────────────────────────────────────────────
 *
 * The IDL is built with MagicBlock macros enabled, so ALL accounts are
 * declared in the IDL (including auto-generated PDA accounts for delegation).
 * Anchor v0.32.1 auto-resolves these accounts from the IDL — no manual
 * remainingAccounts or PDA derivation is needed.
 *
 * delegate_match: 8 accounts (payer, buffer_chess_match, delegation_record,
 *   delegation_metadata, chess_match, owner_program, delegation_program,
 *   system_program) — ALL auto-resolved by Anchor.
 *
 * commit_state / undelegate_match: 4 accounts (payer, chess_match,
 *   magic_program [Task Scheduler], magic_context) — ALL auto-resolved.
 *
 * ── Free Commit Budget ──────────────────────────────────────────────────
 *
 * MagicBlock grants 10 free commits per delegated account. This test uses
 * at most 1 commit, well within the free tier.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// @ts-ignore — JSON import may need resolveJsonModule in tsconfig
import idl from "../target/idl/magic_chess.json" with { type: "json" };

// ═══════════════════════════════════════════════════════════════════════
// MagicBlock Constants
// ═══════════════════════════════════════════════════════════════════════

/** Base-layer RPC for delegation/commit/undelegate transactions */
const BASE_LAYER_RPC = "https://rpc.magicblock.app/devnet";

/** Router API base URL for delegation status queries */
const ROUTER_API_BASE = "https://devnet-router.magicblock.app";

/** MagicBlock Delegation program address */
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

/** PDA seeds for chess_match accounts */
const CHESS_MATCH_SEED = Buffer.from("chess_match");

/** Number of blocks to wait for delegation confirmation (up to ~5 seconds) */
const DELEGATION_POLL_RETRIES = 25;
const DELEGATION_POLL_INTERVAL_MS = 1000;

// ═══════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════

describe("MagicBlock Ephemeral Rollup — Full Lifecycle", () => {
  // ── Provider setup ──────────────────────────────────────────────────
  // Use the MagicBlock RPC for the Anchor provider (delegation/commit/undelegate).
  // For funding, fall back to standard devnet RPC to avoid sync lag.
  const baseConnection = new anchor.web3.Connection(BASE_LAYER_RPC, "confirmed");
  const baseConnectionFallback = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Payer wallet — reuses ANCHOR_WALLET keypair to avoid needing SOL transfers
  const payer = (() => {
    const envWallet = anchor.AnchorProvider.env().wallet;
    return (envWallet as any).payer as anchor.web3.Keypair;
  })();

  // Opponent wallet — player 2 who joins the match
  const opponent = anchor.web3.Keypair.generate();

  // Platform fee wallet
  const platformFeeWallet = anchor.web3.Keypair.generate();

  // Provider wrapping our base-layer connection
  const provider = new anchor.AnchorProvider(
    baseConnection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // Program instance
  const program = new anchor.Program(idl as any, provider);

  // ── Test state ──────────────────────────────────────────────────────
  const matchId = "mb-integration-" + Date.now().toString(36);
  let chessMatchPda: PublicKey;
  let chessMatchBump: number;

  // SPL token mint for betting
  let bettingMint: PublicKey;
  let payerAta: PublicKey;
  let opponentAta: PublicKey;

  // ER connection — resolved from router after delegation
  let erConnection: anchor.web3.Connection | null = null;
  let erFqdn: string | null = null;

  // ────────────────────────────────────────────────────────────────────
  // Setup: create SPL token mint and fund both players
  // ────────────────────────────────────────────────────────────────────
  before(async function () {
    this.timeout(120000);

    console.log(`Payer: ${payer.publicKey.toBase58()}`);
    console.log(`Opponent: ${opponent.publicKey.toBase58()}`);

    // Fund opponent wallet (small amount needed for join + tx fee)
    const payerBal = await baseConnectionFallback.getBalance(payer.publicKey);
    console.log(`Payer balance: ${payerBal / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    // Try airdrop to opponent, fall back to small transfer from payer
    const opponentFundAmount = 0.1 * anchor.web3.LAMPORTS_PER_SOL; // 0.1 SOL
    console.log(`Funding opponent: ${opponent.publicKey.toBase58().slice(0, 8)}...`);
    try {
      const sig = await baseConnectionFallback.requestAirdrop(
        opponent.publicKey, opponentFundAmount
      );
      await baseConnectionFallback.confirmTransaction(sig);
      console.log(`  Airdrop confirmed: ${sig.slice(0, 12)}...`);
    } catch (e: any) {
      console.log(`  Airdrop failed, transferring from payer...`);
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: opponent.publicKey,
          lamports: opponentFundAmount,
        })
      );
      try {
        await anchor.web3.sendAndConfirmTransaction(
          baseConnectionFallback, tx, [payer]
        );
        console.log(`  Funded via transfer.`);
      } catch (e2: any) {
        console.log(`  Transfer also failed: ${e2.message?.slice(0, 80)}`);
        console.log(`  Payer may not have enough SOL. Skipping funding.`);
      }
    }

    // Wait for MagicBlock RPC to sync opponent balance
    for (let i = 0; i < 10; i++) {
      const bal = await baseConnection.getBalance(opponent.publicKey);
      if (bal > 0) { console.log(`  Opponent balance synced: ${bal / anchor.web3.LAMPORTS_PER_SOL} SOL`); break; }
      if (i === 0) console.log(`Waiting for RPC sync...`);
      await sleep(1000);
    }

    console.log(`Match ID: ${matchId}`);

    // Create a fake SPL token mint for betting (devnet)
    bettingMint = await createMint(
      baseConnection,
      payer,
      payer.publicKey,    // mint authority
      null,               // freeze authority
      6                   // decimals
    );
    console.log(`Betting mint: ${bettingMint.toBase58()}`);

    // Create ATAs for both players
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
        payer,            // fee payer
        bettingMint,
        opponent.publicKey
      )
    ).address;

    // Mint 1000 tokens to each player
    await mintTo(
      baseConnection,
      payer,
      bettingMint,
      payerAta,
      payer.publicKey,
      1000_000000  // 1000 tokens with 6 decimals
    );
    await mintTo(
      baseConnection,
      payer,
      bettingMint,
      opponentAta,
      payer.publicKey,
      1000_000000
    );

    console.log("Setup complete: both players funded with 1000 test tokens");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 1: Initialize a chess match
  // ────────────────────────────────────────────────────────────────────
  it("Step 1 — Initialize a chess match on devnet", async () => {
    // Derive the chess_match PDA
    [chessMatchPda, chessMatchBump] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Derive the escrow token account PDA
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_escrow"), Buffer.from(matchId)],
      program.programId
    );

    const betAmount = new BN(100_000000); // 100 tokens
    const timeoutDuration = new BN(900);  // 15 minutes
    const feeBps = 200;                   // 2% platform fee

    const tx = await program.methods
      .initializeMatch(
        matchId,
        betAmount,
        timeoutDuration,
        feeBps,
        platformFeeWallet.publicKey,
        false                 // prediction_enabled
      )
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: payer.publicKey,
        bettingTokenMintAccount: bettingMint,
        playerTokenAccount: payerAta,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log(`Initialize tx: ${tx}`);

    // Verify on-chain state
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(matchAccount.matchId, matchId, "Match ID mismatch");
    assert.equal(
      matchAccount.players[0].toBase58(),
      payer.publicKey.toBase58(),
      "Player 1 should be payer"
    );
    assert.deepEqual(
      matchAccount.gameStatus,
      { waitingForOpponent: {} },
      "Game should be WaitingForOpponent"
    );
    // MagicBlock fields should be unset
    assert.equal(matchAccount.isDelegated, false, "Should not be delegated yet");
    assert.equal(matchAccount.delegationUid, "", "Delegation UID should be empty");

    console.log("Match initialized successfully");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 2: Delegate the chess_match account to MagicBlock ER
  // ────────────────────────────────────────────────────────────────────
  it("Step 2 — Delegate the match account to MagicBlock ER", async () => {
    const uid = `chess-${matchId}`;

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

    const tx = await program.methods
      .delegateMatch()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
        bufferChessMatch: bufferChessMatch,
        delegationRecordChessMatch: delegationRecordChessMatch,
        delegationMetadataChessMatch: delegationMetadataChessMatch,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log(`Delegate tx: ${tx}`);

    // Poll the MagicBlock Router until the account is delegated (JSON-RPC POST)
    let isDelegated = false;
    for (let i = 0; i < DELEGATION_POLL_RETRIES; i++) {
      await sleep(DELEGATION_POLL_INTERVAL_MS);

      try {
        const response = await fetch(ROUTER_API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getDelegationStatus",
            params: [chessMatchPda.toBase58()],
          }),
        });

        if (!response.ok) continue;

        const body = await response.json();
        const status = body.result;

        // Router response shape (JSON-RPC):
        // { jsonrpc: "2.0", id: 1, result: { isDelegated: true, fqdn: "https://...", ... } }
        if (status && status.isDelegated && status.fqdn) {
          isDelegated = true;
          erFqdn = status.fqdn;
          console.log(`Delegation confirmed. ER fqdn: ${erFqdn}`);
          if (status.delegationRecord) {
            console.log(`Delegation slot: ${status.delegationRecord.delegationSlot}`);
          }
          break;
        }
      } catch (err) {
        // Router may not be immediately available; keep polling
        console.log(`Poll ${i + 1}: router not ready yet...`);
      }
    }

    assert.isTrue(isDelegated, "Delegation should be confirmed by router");
    assert.isNotNull(erFqdn, "ER fqdn should be resolved");

    // Verify on-chain: is_delegated should be true, delegation_uid set
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(matchAccount.isDelegated, true, "Account should be marked delegated");
    assert.equal(matchAccount.delegationUid, uid, "Delegation UID should be set");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 3: Verify delegation via router getDelegationStatus
  // ────────────────────────────────────────────────────────────────────
  it("Step 3 — Verify delegation status via Router API", async () => {
    // Fetch delegation status from the router (JSON-RPC POST)
    const response = await fetch(ROUTER_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [chessMatchPda.toBase58()],
      }),
    });

    assert.isTrue(response.ok, "Router should return 200");

    const body = await response.json();
    const status = body.result;
    console.log("Router delegation status:", JSON.stringify(status, null, 2));

    assert.isTrue(status.isDelegated, "Router should report isDelegated=true");
    assert.isString(status.fqdn, "Router should return an fqdn");

    // Build ER connection from the resolved fqdn
    // Router fqdn may already include https:// prefix
    const erFqdnStr = status.fqdn as string;
    const erRpcUrl = erFqdnStr.startsWith("https://") ? erFqdnStr : `https://${erFqdnStr}`;
    erConnection = new anchor.web3.Connection(erRpcUrl, "confirmed");
    console.log(`ER RPC connection established: ${erRpcUrl}`);

    // Quick sanity: the ER should be reachable
    const erVersion = await erConnection.getVersion();
    console.log(`ER version: ${JSON.stringify(erVersion)}`);

    // The base-layer account state should now be mirrored on the ER.
    // We can verify by fetching the account from the ER connection:
    const erMatchAccount = await erConnection.getAccountInfo(chessMatchPda);
    assert.isNotNull(erMatchAccount, "ER should have the delegated account data");
    console.log(`ER account data size: ${erMatchAccount!.data.length} bytes`);
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 4: Make chess moves on the Ephemeral Rollup
  // ────────────────────────────────────────────────────────────────────
  it("Step 4 — Make moves on the ER (fast confirmations)", async () => {
    // We need a second player joined to make moves in an active game.
    // First, join the match as player 2 (opponent).
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_escrow"), Buffer.from(matchId)],
      program.programId
    );

    // Join the match
    const betAmount = new BN(100_000000);
    const joinTx = await program.methods
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

    console.log(`Join tx: ${joinTx}`);

    // Now the game is Active. Player 1 (White, payer) makes the first move.
    // Create an Anchor Program instance pointing at the ER connection.
    // The provider stays the same wallet but the RPC endpoint switches.
    const erProvider = new anchor.AnchorProvider(
      erConnection!,
      new anchor.Wallet(payer),
      { commitment: "confirmed" }
    );
    const erProgram = new anchor.Program(idl as any, erProvider);

    // Standard chess opening: e2 → e4 (White pawn moves two squares)
    // Board coordinates: row 0-7, col 0-7. a1 = (0,0), h8 = (7,7).
    // e2 = row 1, col 4.  e4 = row 3, col 4.
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

    console.log(`Move (e2-e4) tx on ER: ${moveTx}`);

    // Verify the move was applied on the ER
    const erMatchAccount = await erConnection!.getAccountInfo(chessMatchPda);
    assert.isNotNull(erMatchAccount, "ER account should still exist");

    // Fetch via Anchor to decode
    const matchData = await erProgram.account.chessMatch.fetch(chessMatchPda);
    assert.deepEqual(
      matchData.gameStatus,
      { active: {} },
      "Game should still be active after one move"
    );
    // After White's move, it should be Black's turn
    assert.deepEqual(matchData.currentTurn, { black: {} }, "Should be Black's turn now");

    // The base layer still shows the pre-move state (not yet committed)
    const baseMatchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.deepEqual(
      baseMatchData.currentTurn,
      { white: {} },
      "Base layer should still show White's turn (uncommitted)"
    );

    console.log("ER move confirmed. Base layer still has stale (pre-move) state.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 5: Commit state back to the base layer
  // ────────────────────────────────────────────────────────────────────
  it("Step 5 — Commit ER state back to the base layer", async () => {
    // The commit_state instruction has 4 accounts: payer, chess_match,
    // magic_program (Task Scheduler: Magic11111111111111111111111111111111111111),
    // magic_context (MagicContext1111111111111111111111111111111).
    // All are auto-resolved by Anchor from the IDL.
    const tx = await program.methods
      .commitState()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .signers([payer])
      .rpc();

    console.log(`Commit tx: ${tx}`);

    // After commit, the base layer should reflect the ER state
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.deepEqual(
      matchData.currentTurn,
      { black: {} },
      "Base layer should now show Black's turn (after commit)"
    );

    console.log("Base-layer state synchronized after commit");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 6: Undelegate the account
  // ────────────────────────────────────────────────────────────────────
  it("Step 6 — Undelegate the match account", async () => {
    // Undelegate: commit any remaining state and release the account from ER.
    // Uses @commit macro internally via commit_and_undelegate.
    // Same account structure as commitState; Anchor auto-resolves all.
    const tx = await program.methods
      .undelegateMatch()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .signers([payer])
      .rpc();

    console.log(`Undelegate tx: ${tx}`);

    // On-chain: is_delegated should be false
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(matchData.isDelegated, false, "Account should no longer be delegated");

    // Router should confirm undelegation (JSON-RPC POST)
    await sleep(2000);
    try {
      const routerStatus = await fetch(ROUTER_API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getDelegationStatus",
          params: [chessMatchPda.toBase58()],
        }),
      });
      if (routerStatus.ok) {
        const body = await routerStatus.json();
        const status = body.result;
        assert.equal(
          status.isDelegated,
          false,
          "Router should report not delegated after undelegate"
        );
      }
    } catch {
      // Router may return 404 for undelegated accounts — that's fine too
      console.log("Router returned non-200 for undelegated account (expected)");
    }

    console.log("Undelegation complete. Account released from ER.");
    console.log("=== Full ER lifecycle test PASSED ===");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
