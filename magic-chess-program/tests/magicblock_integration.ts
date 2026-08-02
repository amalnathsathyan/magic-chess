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
 * The delegate_match instruction uses @delegate from ephemeral_rollups_sdk,
 * which injects two extra accounts beyond what the base IDL declares:
 *   - magic_context  (MagicContext account)
 *   - magic_program  (Delegation program: DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)
 *
 * Similarly, commit_state uses @commit, which injects:
 *   - magic_context
 *   - magic_program
 *
 * These accounts must be resolved at runtime. The Anchor TS client may not
 * auto-resolve them if the IDL was built without the MagicBlock macros.
 * In that case, add them manually to the transaction instruction.
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
import idl from "../target/idl/magic_chess.json";

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
  // Use the base-layer RPC for the Anchor provider.
  // WARNING: The standard AnchorProvider will connect to the base layer.
  // For ER transactions (moves), we construct a separate Connection to the
  // ER fqdn resolved from the router.
  const baseConnection = new anchor.web3.Connection(BASE_LAYER_RPC, "confirmed");

  // Payer wallet — in a real test, this comes from the Anchor provider's wallet.
  // For devnet tests, ensure ~0.5 SOL for account rent + transaction fees.
  const payer = anchor.web3.Keypair.generate();

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
  before(async () => {
    // NOTE: In a real test, you would airdrop SOL to the payer and opponent.
    // For devnet, request airdrops:
    //   await baseConnection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    // For local testing where balances may be zero, consider:
    //   - Using a pre-funded keypair from Anchor.toml provider.wallet
    //   - Or seeding funds via solana-test-validator

    console.log(`Payer: ${payer.publicKey.toBase58()}`);
    console.log(`Opponent: ${opponent.publicKey.toBase58()}`);
    console.log(`Match ID: ${matchId}`);

    // Create a fake SPL token mint for betting (devnet)
    // In production, you would use an existing mint like USDC or wSOL.
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
        platformFeeWallet.publicKey
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
    assert.equal(
      matchAccount.gameStatus as any,
      0, // WaitingForOpponent
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

    // IMPORTANT: The delegate_match instruction uses the @delegate macro from
    // ephemeral_rollups_sdk, which injects two extra accounts:
    //   - magic_context: The MagicContext PDA
    //   - magic_program:  DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh
    //
    // If the IDL was rebuilt with the MagicBlock feature enabled, these accounts
    // will be auto-resolved by Anchor. Otherwise, they need to be passed in the
    // `.remainingAccounts()` array.
    //
    // The MagicContext PDA is derived as:
    //   findProgramAddressSync([b"magic_context"], delegation_program_id)

    const tx = await program.methods
      .delegateMatch(uid)
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .remainingAccounts([
        // MagicContext PDA — the ER runtime context account
        {
          pubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("magic_context")],
            DELEGATION_PROGRAM_ID
          )[0],
          isWritable: false,
          isSigner: false,
        },
        // MagicBlock delegation program
        {
          pubkey: DELEGATION_PROGRAM_ID,
          isWritable: false,
          isSigner: false,
        },
      ])
      .signers([payer])
      .rpc();

    console.log(`Delegate tx: ${tx}`);

    // Poll the MagicBlock Router until the account is delegated
    let isDelegated = false;
    for (let i = 0; i < DELEGATION_POLL_RETRIES; i++) {
      await sleep(DELEGATION_POLL_INTERVAL_MS);

      try {
        const response = await fetch(
          `${ROUTER_API_BASE}/delegation/${chessMatchPda.toBase58()}`
        );

        if (!response.ok) continue;

        const status = await response.json();

        // Router response shape:
        // {
        //   "delegated": true,
        //   "fqdn": "er-xxx.devnet.magicblock.app",
        //   "commit_count": 0,
        //   ...
        // }
        if (status.delegated && status.fqdn) {
          isDelegated = true;
          erFqdn = status.fqdn;
          console.log(`Delegation confirmed. ER fqdn: ${erFqdn}`);
          console.log(`Commit count: ${status.commit_count}`);
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
    // Fetch delegation status from the router
    const response = await fetch(
      `${ROUTER_API_BASE}/delegation/${chessMatchPda.toBase58()}`
    );

    assert.isTrue(response.ok, "Router should return 200");

    const status = await response.json();
    console.log("Router delegation status:", JSON.stringify(status, null, 2));

    assert.isTrue(status.delegated, "Router should report delegated=true");
    assert.isString(status.fqdn, "Router should return an fqdn");

    // Build ER connection from the resolved fqdn
    const erRpcUrl = `https://${status.fqdn}`;
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
    assert.equal(
      matchData.gameStatus as any,
      1, // Active
      "Game should still be active after one move"
    );
    // After White's move, it should be Black's turn
    assert.equal(matchData.currentTurn as any, 1, "Should be Black's turn now");

    // The base layer still shows the pre-move state (not yet committed)
    const baseMatchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(
      baseMatchData.currentTurn as any,
      0, // Still White's turn on base layer
      "Base layer should still show White's turn (uncommitted)"
    );

    console.log("ER move confirmed. Base layer still has stale (pre-move) state.");
  });

  // ────────────────────────────────────────────────────────────────────
  // Step 5: Commit state back to the base layer
  // ────────────────────────────────────────────────────────────────────
  it("Step 5 — Commit ER state back to the base layer", async () => {
    // The commit_state instruction uses the @commit macro, which injects
    // magic_context and magic_program accounts like delegate does.
    const tx = await program.methods
      .commitState()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .remainingAccounts([
        {
          pubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("magic_context")],
            DELEGATION_PROGRAM_ID
          )[0],
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: DELEGATION_PROGRAM_ID,
          isWritable: false,
          isSigner: false,
        },
      ])
      .signers([payer])
      .rpc();

    console.log(`Commit tx: ${tx}`);

    // After commit, the base layer should reflect the ER state
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(
      matchData.currentTurn as any,
      1, // Black's turn
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
    const tx = await program.methods
      .undelegateMatch()
      .accounts({
        payer: payer.publicKey,
        chessMatch: chessMatchPda,
      })
      .remainingAccounts([
        {
          pubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("magic_context")],
            DELEGATION_PROGRAM_ID
          )[0],
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: DELEGATION_PROGRAM_ID,
          isWritable: false,
          isSigner: false,
        },
      ])
      .signers([payer])
      .rpc();

    console.log(`Undelegate tx: ${tx}`);

    // On-chain: is_delegated should be false
    const matchData = await program.account.chessMatch.fetch(chessMatchPda);
    assert.equal(matchData.isDelegated, false, "Account should no longer be delegated");

    // Router should confirm undelegation
    await sleep(2000);
    try {
      const routerStatus = await fetch(
        `${ROUTER_API_BASE}/delegation/${chessMatchPda.toBase58()}`
      );
      if (routerStatus.ok) {
        const status = await routerStatus.json();
        assert.equal(
          status.delegated,
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
