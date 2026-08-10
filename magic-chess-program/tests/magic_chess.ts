/**
 * magic_chess.ts
 *
 * Standard Anchor integration tests for the Magic Chess program.
 * Covers the normal match lifecycle using `anchor test` on localnet.
 *
 * These tests use the Anchor provider (localnet) and standard SPL token
 * operations. MagicBlock-specific flows (delegation, commit, undelegation,
 * task scheduling) are tested separately in `magicblock_integration.ts`.
 *
 * Instructions NOT tested here (require MagicBlock infra on localnet):
 *   - delegate_match       (needs DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)
 *   - commit_state         (needs MagicContext + delegation program)
 *   - undelegate_match     (needs MagicContext + delegation program)
 *   - schedule_timeout     (needs Magic11111111111111111111111111111111111111)
 *   - cancel_timeout_task  (needs MagicBlock task scheduler)
 *
 * Instructions that invoke MagicBlock task scheduling conditionally:
 *   - make_move            (when move_timeout_duration > 0)
 *   - claim_timeout_win    (unconditionally schedules post-settlement tasks)
 *
 * For localnet tests we use move_timeout_duration = 0 to skip MagicBlock
 * task scheduling in make_move. The claim_timeout_win test is written
 * but cannot run on localnet — it requires MagicBlock infra.
 *
 * Run with:
 *   anchor test --skip-build --skip-deploy
 *
 * Or the full cycle:
 *   anchor build && anchor deploy && anchor test --skip-build --skip-deploy
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import idl from "../target/idl/magic_chess.json" with { type: "json" };
import type { MagicChess } from "../target/types/magic_chess";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const CHESS_MATCH_SEED = Buffer.from("chess_match");
const MATCH_ESCROW_SEED = Buffer.from("match_escrow");

/** GameStatus enum variants (matches Rust enum order) */
const GameStatus = {
  WaitingForOpponent: 0,
  Active: 1,
  WhiteWins: 2,
  BlackWins: 3,
  Draw: 4,
  Aborted: 5,
} as const;

/** PlayerColor enum variants */
const PlayerColor = {
  White: 0,
  Black: 1,
} as const;

/** GameEndReason enum variants */
const GameEndReason = {
  Checkmate: 0,
  Stalemate: 1,
  Resignation: 2,
  Timeout: 3,
  FiftyMoveRule: 4,
  ThreefoldRepetition: 5,
  Aborted: 6,
} as const;

/** PieceType enum variants for promotion */
const PieceType = {
  Pawn: { pawn: {} },
  Knight: { knight: {} },
  Bishop: { bishop: {} },
  Rook: { rook: {} },
  Queen: { queen: {} },
  King: { king: {} },
} as const;

/** Token decimals used for betting mint */
const TOKEN_DECIMALS = 6;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new SPL token mint, ATAs for both players, and a platform
 * fee ATA, then mint tokens to both players.
 *
 * Returns all relevant pubkeys and objects so tests can use them.
 */
async function setupTokenMint(
  connection: anchor.web3.Connection,
  payer: Keypair,
  player1: Keypair,
  player2: Keypair,
  platformFeeWallet: Keypair,
  decimals: number = TOKEN_DECIMALS
) {
  // Create mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,   // mint authority
    null,              // freeze authority
    decimals
  );

  // Create ATAs
  const player1Ata = (
    await getOrCreateAssociatedTokenAccount(
      connection, payer, mint, player1.publicKey
    )
  ).address;

  const player2Ata = (
    await getOrCreateAssociatedTokenAccount(
      connection, payer, mint, player2.publicKey
    )
  ).address;

  const platformFeeAta = (
    await getOrCreateAssociatedTokenAccount(
      connection, payer, mint, platformFeeWallet.publicKey
    )
  ).address;

  // Mint tokens to both players
  const mintAmount = 10_000 * 10 ** decimals;
  await mintTo(connection, payer, mint, player1Ata, payer.publicKey, mintAmount);
  await mintTo(connection, payer, mint, player2Ata, payer.publicKey, mintAmount);

  return { mint, player1Ata, player2Ata, platformFeeAta };
}

/**
 * Create a fresh match and have player2 join it.
 * Returns everything needed to make moves.
 */
async function createAndJoinMatch(
  program: Program<MagicChess>,
  provider: anchor.AnchorProvider,
  player1: Keypair,
  player2: Keypair,
  mint: PublicKey,
  player1Ata: PublicKey,
  player2Ata: PublicKey,
  platformFeeWallet: PublicKey,
  betAmount: BN = new BN(100 * 10 ** TOKEN_DECIMALS),
  matchIdPrefix: string = "match"
) {
  const matchId = `${matchIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);

  // Derive PDAs
  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [CHESS_MATCH_SEED, Buffer.from(matchId)],
    program.programId
  );

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [MATCH_ESCROW_SEED, Buffer.from(matchId)],
    program.programId
  );

  // Initialize match
  await program.methods
    .initializeMatch(
      matchId,
      betAmount,
      new BN(0),               // move_timeout_duration = 0 (no MagicBlock timeout)
      200,                     // platform_fee_basis_points = 2%
      platformFeeWallet,
      false                     // prediction_enabled
    )
    .accounts({
      chessMatch: chessMatchPda,
      playerSigner: player1.publicKey,
      rentPayer: player1.publicKey,
      bettingTokenMintAccount: mint,
      playerTokenAccount: player1Ata,
      matchEscrowTokenAccount: escrowPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([player1])
    .rpc()
    .catch((err: any) => {
      console.error("initialize_match failed:", err?.logs ?? err?.message ?? err);
      throw err;
    });

  // Join match
  await program.methods
    .joinMatch(betAmount)
    .accounts({
      chessMatch: chessMatchPda,
      playerTwoSigner: player2.publicKey,
      playerTokenAccount: player2Ata,
      matchEscrowTokenAccount: escrowPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([player2])
    .rpc()
    .catch((err: any) => {
      console.error("join_match failed:", err?.logs ?? err?.message ?? err);
      throw err;
    });

  return { matchId, chessMatchPda, escrowPda };
}

/**
 * Helper to make a chess move using programmatic coordinates.
 *
 * Board coordinates: row 0..7 (rank 1..8), col 0..7 (file a..h).
 * a1 = (row:0, col:0), h8 = (row:7, col:7).
 */
async function makeMove(
  program: Program<MagicChess>,
  chessMatchPda: PublicKey,
  signer: Keypair,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  promotion: any = null
) {
  return program.methods
    .makeMove({ fromRow, fromCol, toRow, toCol, promotion })
    .accounts({
      chessMatch: chessMatchPda,
      player: signer.publicKey,
    })
    .signers([signer])
    .rpc()
    .catch((err: any) => {
      // Re-throw with logs for debugging
      console.error(
        `Move (${fromRow},${fromCol})->(${toRow},${toCol}) failed:`,
        err?.logs ?? err?.message ?? err
      );
      throw err;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════════

describe("Magic Chess — Standard Integration Tests", () => {
  // ── Provider setup ────────────────────────────────────────────────────
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program<MagicChess>(idl as any, provider);

  // Detect localnet to conditionally skip MagicBlock-dependent tests
  const isLocalnet = (provider.connection.rpcEndpoint.includes("localhost")
    || provider.connection.rpcEndpoint.includes("127.0.0.1"));

  // ── Persistent wallets — loaded from file, reused across runs ─────────
  const WALLET_DIR = path.join(__dirname, "..", ".test-wallets");
  const MINT_FILE = path.join(WALLET_DIR, "mint.json");

  function loadOrCreateKeypair(name: string): Keypair {
    const filePath = path.join(WALLET_DIR, `${name}.json`);
    if (fs.existsSync(filePath)) {
      const secretBytes = Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")));
      return Keypair.fromSecretKey(secretBytes);
    }
    const kp = Keypair.generate();
    fs.mkdirSync(WALLET_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`  Created new ${name} wallet: ${kp.publicKey.toBase58().slice(0, 8)}...`);
    return kp;
  }

  const player1 = loadOrCreateKeypair("player1");
  const player2 = loadOrCreateKeypair("player2");
  const platformFeeWallet = loadOrCreateKeypair("platform-fee");

  // ── Shared SPL token infrastructure ───────────────────────────────────
  let mint: PublicKey;
  let player1Ata: PublicKey;
  let player2Ata: PublicKey;
  let platformFeeAta: PublicKey;

  // ═════════════════════════════════════════════════════════════════════
  // Global Setup — runs once before all tests
  // ═════════════════════════════════════════════════════════════════════
  before(async () => {
    // The Anchor provider's wallet pays for SPL token creation.
    // NodeWallet exposes the underlying Keypair via `.payer`.
    const walletPayer = (provider.wallet as any).payer as Keypair;

    // Fund test wallets from payer (avoids faucet rate limits)
    // Each test creates new PDAs (ChessMatch + escrow token account) which cost rent.
    // With 12 tests, wallets need sufficient SOL to last the entire suite.
    const fundAmount = 1.5 * LAMPORTS_PER_SOL;
    const minBalance = 1.0 * LAMPORTS_PER_SOL;
    for (const kp of [player1, player2, platformFeeWallet]) {
      const currentBalance = await provider.connection.getBalance(kp.publicKey);
      if (currentBalance < minBalance) {
        console.log(`  Funding ${kp.publicKey.toBase58().slice(0, 8)}... with ${fundAmount / LAMPORTS_PER_SOL} SOL from payer`);
        const tx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletPayer.publicKey,
            toPubkey: kp.publicKey,
            lamports: fundAmount,
          })
        );
        await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [walletPayer]);
      }
    }

    // Reuse mint across runs (save address to file)
    if (fs.existsSync(MINT_FILE)) {
      const savedMint = new PublicKey(JSON.parse(fs.readFileSync(MINT_FILE, "utf8")));
      try {
        await getAccount(provider.connection, savedMint);
        mint = savedMint;
        console.log(`  Reusing saved mint: ${mint.toBase58()}`);
      } catch {
        console.log("  Saved mint gone, creating fresh one");
        fs.unlinkSync(MINT_FILE);
      }
    }

    if (mint) {
      // Reuse existing mint — just get/create ATAs and top up tokens
      player1Ata = (await getOrCreateAssociatedTokenAccount(
        provider.connection, walletPayer, mint, player1.publicKey
      )).address;
      player2Ata = (await getOrCreateAssociatedTokenAccount(
        provider.connection, walletPayer, mint, player2.publicKey
      )).address;
      platformFeeAta = (await getOrCreateAssociatedTokenAccount(
        provider.connection, walletPayer, mint, platformFeeWallet.publicKey
      )).address;
      // Top up tokens if low
      const p1Bal = Number((await getAccount(provider.connection, player1Ata)).amount);
      if (p1Bal < 1000 * 10 ** TOKEN_DECIMALS) {
        console.log("  Topping up tokens...");
        await mintTo(provider.connection, walletPayer, mint, player1Ata, walletPayer, 10_000 * 10 ** TOKEN_DECIMALS);
        await mintTo(provider.connection, walletPayer, mint, player2Ata, walletPayer, 10_000 * 10 ** TOKEN_DECIMALS);
      }
    } else {
      // Create fresh mint + ATAs + save
      const tokens = await setupTokenMint(
        provider.connection, walletPayer, player1, player2, platformFeeWallet
      );
      mint = tokens.mint;
      player1Ata = tokens.player1Ata;
      player2Ata = tokens.player2Ata;
      platformFeeAta = tokens.platformFeeAta;
      fs.writeFileSync(MINT_FILE, JSON.stringify(mint.toBase58()));
    }

    console.log(`Mint:          ${mint.toBase58()}`);
    console.log(`Player1:       ${player1.publicKey.toBase58()}`);
    console.log(`Player2:       ${player2.publicKey.toBase58()}`);
    console.log(`Platform fee:  ${platformFeeWallet.publicKey.toBase58()}`);
    console.log(`Player1 ATA:   ${player1Ata.toBase58()}`);
    console.log(`Player2 ATA:   ${player2Ata.toBase58()}`);
    console.log(`Platform ATA:  ${platformFeeAta.toBase58()}`);
    console.log(`Program ID:    ${program.programId.toBase58()}`);
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 1: Initialize a Match
  // ═════════════════════════════════════════════════════════════════════
  it("initializes a match", async () => {
    const matchId = `init-${Date.now()}`;
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS); // 100 tokens

    // Derive PDAs
    const [chessMatchPda] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [MATCH_ESCROW_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Check pre-balances
    const prePlayerBalance = await getAccount(provider.connection, player1Ata);
    const preEscrowBalance = await (async () => {
      try { return (await getAccount(provider.connection, escrowPda)).amount; }
      catch { return BigInt(0); }
    })();

    // Call initialize_match
    await program.methods
      .initializeMatch(
        matchId,
        betAmount,
        new BN(0),                // no timeout — skip MagicBlock task scheduling
        200,                      // 2% platform fee
        platformFeeWallet.publicKey,
        false                     // prediction_enabled
      )
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player1.publicKey,
        rentPayer: player1.publicKey,
        bettingTokenMintAccount: mint,
        playerTokenAccount: player1Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    // Verify ChessMatch account state
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.matchId).to.equal(matchId);
    expect(matchAccount.players[0].toBase58()).to.equal(player1.publicKey.toBase58());
    expect(matchAccount.players[1].toBase58()).to.equal(PublicKey.default.toBase58());
    expect(matchAccount.currentPlayerIdx).to.equal(0);
    expect(matchAccount.gameStatus).to.deep.equal({ waitingForOpponent: {} }); // GameStatus::WaitingForOpponent
    expect(matchAccount.bettingTokenMint.toBase58()).to.equal(mint.toBase58());
    expect(matchAccount.betAmountPlayerOne.toString()).to.equal(betAmount.toString());
    expect(matchAccount.betAmountPlayerTwo.toString()).to.equal(new BN(0).toString());
    expect(matchAccount.totalPot.toString()).to.equal(betAmount.toString());
    expect(matchAccount.platformFeeBasisPoints).to.equal(200);
    expect(matchAccount.platformFeeWallet.toBase58()).to.equal(platformFeeWallet.publicKey.toBase58());
    expect(matchAccount.payoutProcessed).to.equal(false);
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} }); // PlayerColor::White
    expect(matchAccount.fullmoveNumber).to.equal(1);

    // Verify tokens were transferred from player1 to escrow
    const postPlayerBalance = await getAccount(provider.connection, player1Ata);
    const postEscrowBalance = await getAccount(provider.connection, escrowPda);
    expect(
      BigInt(prePlayerBalance.amount.toString()) - BigInt(postPlayerBalance.amount.toString())
    ).to.equal(BigInt(betAmount.toString()));
    expect(BigInt(postEscrowBalance.amount.toString())).to.equal(BigInt(betAmount.toString()));
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 2: Player 2 Joins a Match
  // ═════════════════════════════════════════════════════════════════════
  it("player 2 joins a match", async () => {
    const matchId = `join-${Date.now()}`;
    const betAmount = new BN(50 * 10 ** TOKEN_DECIMALS); // 50 tokens each

    const [chessMatchPda] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [MATCH_ESCROW_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Initialize match
    await program.methods
      .initializeMatch(matchId, betAmount, new BN(0), 200, platformFeeWallet.publicKey, false)
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player1.publicKey,
        rentPayer: player1.publicKey,
        bettingTokenMintAccount: mint,
        playerTokenAccount: player1Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    // Verify pre-join state
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ waitingForOpponent: {} });

    const prePlayer2Balance = await getAccount(provider.connection, player2Ata);

    // Player 2 joins
    await program.methods
      .joinMatch(betAmount)
      .accounts({
        chessMatch: chessMatchPda,
        playerTwoSigner: player2.publicKey,
        playerTokenAccount: player2Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player2])
      .rpc();

    // Verify post-join state
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.players[1].toBase58()).to.equal(player2.publicKey.toBase58());
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} }); // GameStatus::Active
    expect(matchAccount.betAmountPlayerOne.toString()).to.equal(betAmount.toString());
    expect(matchAccount.betAmountPlayerTwo.toString()).to.equal(betAmount.toString());
    // total_pot should be doubled
    expect(matchAccount.totalPot.toString()).to.equal(betAmount.mul(new BN(2)).toString());
    // current_turn should still be White (player1 moves first)
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} });

    // Verify tokens transferred from player2
    const postPlayer2Balance = await getAccount(provider.connection, player2Ata);
    expect(
      BigInt(prePlayer2Balance.amount.toString()) - BigInt(postPlayer2Balance.amount.toString())
    ).to.equal(BigInt(betAmount.toString()));

    // Verify escrow has both bets
    const escrowBalance = await getAccount(provider.connection, escrowPda);
    expect(BigInt(escrowBalance.amount.toString())).to.equal(
      BigInt(betAmount.mul(new BN(2)).toString())
    );
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 3: Makes a Valid Chess Move
  // ═════════════════════════════════════════════════════════════════════
  it("makes a valid chess move", async () => {
    const { chessMatchPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      new BN(100 * 10 ** TOKEN_DECIMALS),
      "valid-move"
    );

    // Verify game is Active and it's White's turn
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} });
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} });

    // White moves e2-e4 (row:1,col:4 -> row:3,col:4)
    await makeMove(program, chessMatchPda, player1, 1, 4, 3, 4);

    // Verify state after move
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ black: {} }); // Turn switched to Black
    expect(matchAccount.currentPlayerIdx).to.equal(1);
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} }); // Still active
    expect(matchAccount.fullmoveNumber).to.equal(1); // Still move 1 (Black hasn't moved yet)

    // Verify the pawn moved on the board: e2 should be empty, e4 should have White Pawn
    // board[row][col] is an option of Piece { pieceType, color }
    expect(matchAccount.board[1][4]).to.be.null; // e2 now empty
    expect(matchAccount.board[3][4]).to.deep.equal({
      pieceType: { pawn: {} },
      color: { white: {} },
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 4: Rejects Invalid Chess Move
  // ═════════════════════════════════════════════════════════════════════
  it("rejects invalid chess move", async () => {
    const { chessMatchPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      new BN(100 * 10 ** TOKEN_DECIMALS),
      "illegal-move"
    );

    // White tries to move e2-e5 (pawn can't move 3 squares)
    // Expect the transaction to fail
    let errorCaught = false;
    try {
      await makeMove(program, chessMatchPda, player1, 1, 4, 3, 4); // e2-e4 (valid)
    } catch (err: any) {
      errorCaught = true;
    }
    // The first move should be valid — ensure no error
    expect(errorCaught).to.equal(false);

    // Now Black tries an illegal move: e7-e5 is valid, but let's try e7-e4 (3 squares)
    errorCaught = false;
    try {
      await makeMove(program, chessMatchPda, player2, 6, 4, 3, 4); // e7-e4 (illegal 3-square)
      console.log("ERROR: Illegal move should have been rejected");
    } catch (err: any) {
      errorCaught = true;
      // Verify the error log contains the appropriate error
      const logs = err?.logs?.join?.(" ") ?? err?.message ?? "";
      expect(logs).to.satisfy((s: string) =>
        s.includes("IllegalPieceMovement") ||
        s.includes("InvalidMoveIllegal") ||
        s.includes("600")
      );
    }
    expect(errorCaught).to.equal(true, "Illegal move should have been rejected");

    // Verify board state unchanged — still only e2-e4 was played
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ black: {} });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 5: Rejects Move from Wrong Player
  // ═════════════════════════════════════════════════════════════════════
  it("rejects move from wrong player", async () => {
    const { chessMatchPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      new BN(100 * 10 ** TOKEN_DECIMALS),
      "wrong-player"
    );

    // It's White's turn. Black (player2) tries to move — must be rejected
    let errorCaught = false;
    try {
      await makeMove(program, chessMatchPda, player2, 6, 4, 4, 4); // e7-e5
    } catch (err: any) {
      errorCaught = true;
      const logs = err?.logs?.join?.(" ") ?? err?.message ?? "";
      expect(logs).to.satisfy((s: string) =>
        s.includes("UnauthorizedSigner") ||
        s.includes("Unauthorized") ||
        s.includes("6041")
      );
    }
    expect(errorCaught).to.equal(true, "Move from wrong player should be rejected");

    // Verify game state unchanged
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 6: Resign Game
  // ═════════════════════════════════════════════════════════════════════
  it("resign game", async () => {
    const { chessMatchPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      new BN(100 * 10 ** TOKEN_DECIMALS),
      "resign"
    );

    // White resigns
    await program.methods
      .resignGame()
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    // Verify game state
    const matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    // Player1 (White) resigned, so Black wins
    expect(matchAccount.gameStatus).to.deep.equal({ blackWins: {} });
    expect(matchAccount.gameEndReason).to.deep.equal({ resignation: {} });
    expect(matchAccount.payoutProcessed).to.equal(false); // Settlement not yet processed
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 7: Claims Timeout Win
  //
  // NOTE: This test requires the MagicBlock Task Scheduler program
  // (Magic11111111111111111111111111111111111111) to be deployed.
  // On a standard localnet `anchor test`, this program is not available,
  // so claim_timeout_win will fail when it tries to schedule settlement
  // and undelegation tasks. This test is skipped on localnet.
  //
  // To run this test, deploy the MagicBlock programs on your validator
  // or target devnet with `anchor test --provider.cluster devnet`.
  // ═════════════════════════════════════════════════════════════════════
  it("claims timeout win", async function () {
    // Check if MagicBlock Task Scheduler exists on this cluster
    const MAGICBLOCK_TASK_SCHEDULER = new PublicKey("Magic11111111111111111111111111111111111111");
    const taskSchedulerInfo = await provider.connection.getAccountInfo(MAGICBLOCK_TASK_SCHEDULER);
    if (isLocalnet || !taskSchedulerInfo) {
      console.log(
        "  SKIPPED: claim_timeout_win requires MagicBlock Task Scheduler " +
        "(Magic11111111111111111111111111111111111111) deployed on the validator."
      );
      this.skip();
      return;
    }

    const SHORT_TIMEOUT = 2; // 2 seconds
    const matchId = `timeout-${Date.now()}`;
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS);

    const [chessMatchPda] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [MATCH_ESCROW_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Initialize with a short timeout
    await program.methods
      .initializeMatch(
        matchId,
        betAmount,
        new BN(SHORT_TIMEOUT),   // 2-second timeout
        200,
        platformFeeWallet.publicKey,
        false                     // prediction_enabled
      )
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player1.publicKey,
        rentPayer: player1.publicKey,
        bettingTokenMintAccount: mint,
        playerTokenAccount: player1Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    // Join the match
    await program.methods
      .joinMatch(betAmount)
      .accounts({
        chessMatch: chessMatchPda,
        playerTwoSigner: player2.publicKey,
        playerTokenAccount: player2Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player2])
      .rpc();

    // Verify game started and it's White's turn
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} });
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} });

    // Wait for the timeout to expire
    console.log(`  Waiting ${SHORT_TIMEOUT + 1}s for White's timeout...`);
    await new Promise((resolve) => setTimeout(resolve, (SHORT_TIMEOUT + 1) * 1000));

    // Player 2 (Black) claims timeout win since White didn't move
    // This requires the game to be active, it to be White's turn,
    // and the last_move_timestamp to be older than timeout_duration
    await program.methods
      .claimTimeoutWin()
      .accounts({
        chessMatch: chessMatchPda,
        claimerSigner: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Verify game state
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ blackWins: {} });
    expect(matchAccount.gameEndReason).to.deep.equal({ timeout: {} });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 8: Settles Match After Win
  // ═════════════════════════════════════════════════════════════════════
  it("settles match after win", async () => {
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS); // 100 tokens each
    const { matchId, chessMatchPda, escrowPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      betAmount,
      "settle"
    );

    // Play a move and then resign
    await makeMove(program, chessMatchPda, player1, 1, 4, 3, 4); // e2-e4

    // Player2 resigns (Black resigns -> White wins)
    await program.methods
      .resignGame()
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player2.publicKey,
      })
      .signers([player2])
      .rpc();

    // Verify pre-settlement state
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ whiteWins: {} });
    expect(matchAccount.payoutProcessed).to.equal(false);

    // Get pre-settlement balances
    const prePlayer1Balance = await getAccount(provider.connection, player1Ata);
    const prePlayer2Balance = await getAccount(provider.connection, player2Ata);
    const prePlatformBalance = await getAccount(provider.connection, platformFeeAta);
    const preEscrowBalance = await getAccount(provider.connection, escrowPda);

    // Escrow should hold 200 tokens (100 + 100)
    expect(BigInt(preEscrowBalance.amount.toString())).to.equal(
      BigInt(betAmount.mul(new BN(2)).toString())
    );

    // Process settlement
    await program.methods
      .processMatchSettlement()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: escrowPda,
        playerOneAta: player1Ata,
        playerTwoAta: player2Ata,
        platformFeeAta: platformFeeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify post-settlement state
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.payoutProcessed).to.equal(true);

    // Verify token distribution:
    // Total pot = 200 tokens. Fee = 2% of 200 = 4 tokens.
    // Winner (player1/White) gets: 200 - 4 = 196 tokens.
    const fee = BigInt(betAmount.mul(new BN(2)).mul(new BN(2)).div(new BN(100)).toString()); // 2% of 200
    const winnerAmount = BigInt(betAmount.mul(new BN(2)).toString()) - fee;

    const postPlayer1Balance = await getAccount(provider.connection, player1Ata);
    const postPlatformBalance = await getAccount(provider.connection, platformFeeAta);

    // Player1 received their winnings (196 tokens added on top of remaining balance)
    expect(
      BigInt(postPlayer1Balance.amount.toString()) - BigInt(prePlayer1Balance.amount.toString())
    ).to.equal(winnerAmount);

    // Platform received the fee
    expect(
      BigInt(postPlatformBalance.amount.toString()) - BigInt(prePlatformBalance.amount.toString())
    ).to.equal(fee);

    // Player2 should not receive anything (they lost)
    const postPlayer2Balance = await getAccount(provider.connection, player2Ata);
    expect(BigInt(postPlayer2Balance.amount.toString())).to.equal(
      BigInt(prePlayer2Balance.amount.toString())
    );

    // Escrow should be drained (0 tokens)
    const postEscrowBalance = await getAccount(provider.connection, escrowPda);
    expect(BigInt(postEscrowBalance.amount.toString())).to.equal(BigInt(0));
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 9: Aborts Waiting Match
  // ═════════════════════════════════════════════════════════════════════
  it("aborts waiting match", async () => {
    const matchId = `abort-${Date.now()}`;
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS);

    const [chessMatchPda] = PublicKey.findProgramAddressSync(
      [CHESS_MATCH_SEED, Buffer.from(matchId)],
      program.programId
    );
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [MATCH_ESCROW_SEED, Buffer.from(matchId)],
      program.programId
    );

    // Initialize match (no join)
    await program.methods
      .initializeMatch(matchId, betAmount, new BN(0), 200, platformFeeWallet.publicKey, false)
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: player1.publicKey,
        rentPayer: player1.publicKey,
        bettingTokenMintAccount: mint,
        playerTokenAccount: player1Ata,
        matchEscrowTokenAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    // Verify match exists and is WaitingForOpponent
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ waitingForOpponent: {} });

    // Verify escrow has bet tokens
    const escrowBalance = await getAccount(provider.connection, escrowPda);
    expect(BigInt(escrowBalance.amount.toString())).to.equal(BigInt(betAmount.toString()));

    // Get pre-abort player balance
    const prePlayer1Balance = await getAccount(provider.connection, player1Ata);

    // Player1 aborts the match
    await program.methods
      .abortMatch()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: escrowPda,
        playerTokenAccount: player1Ata,
        playerSigner: player1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player1])
      .rpc();

    // Verify match state
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal({ aborted: {} });
    expect(matchAccount.gameEndReason).to.deep.equal({ aborted: {} });
    expect(matchAccount.payoutProcessed).to.equal(true); // Prevents settlement

    // Verify tokens returned to player1
    const postPlayer1Balance = await getAccount(provider.connection, player1Ata);
    // Player1 gets their bet back. They also paid rent for the escrow account
    // which is returned as lamports to player1 (not tokens). So token balance
    // for player1 should increase by the bet amount.
    expect(
      BigInt(postPlayer1Balance.amount.toString()) - BigInt(prePlayer1Balance.amount.toString())
    ).to.equal(BigInt(betAmount.toString()));

    // Verify escrow token account is closed (rent returned to player1)
    let escrowClosed = false;
    try {
      await getAccount(provider.connection, escrowPda);
    } catch {
      escrowClosed = true;
    }
    expect(escrowClosed).to.equal(true, "Escrow token account should be closed");
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 10: Closes Settled Match
  // ═════════════════════════════════════════════════════════════════════
  it("closes settled match", async () => {
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS);
    const { chessMatchPda, escrowPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      betAmount,
      "close"
    );

    // Play move + resign + settle
    await makeMove(program, chessMatchPda, player1, 1, 4, 3, 4); // e2-e4
    await program.methods
      .resignGame()
      .accounts({ chessMatch: chessMatchPda, playerSigner: player2.publicKey })
      .signers([player2])
      .rpc();

    await program.methods
      .processMatchSettlement()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: escrowPda,
        playerOneAta: player1Ata,
        playerTwoAta: player2Ata,
        platformFeeAta: platformFeeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify settled
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.payoutProcessed).to.equal(true);

    // Get payer (player1) pre-close lamport balance
    const prePlayer1Lamports = await provider.connection.getBalance(player1.publicKey);

    // Close the match — rent is returned to the payer
    await program.methods
      .closeMatch()
      .accounts({
        chessMatch: chessMatchPda,
        payer: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    // Verify ChessMatch account is closed
    let accountClosed = false;
    try {
      await program.account.chessMatch.fetch(chessMatchPda);
    } catch {
      accountClosed = true;
    }
    expect(accountClosed).to.equal(true, "ChessMatch account should be closed");

    // Verify rent returned (lamports increased)
    const postPlayer1Lamports = await provider.connection.getBalance(player1.publicKey);
    // Player1 should have more lamports now (rent recovered, minus tx fee)
    // We can't check exact amount due to tx fees, but the account is gone
    expect(postPlayer1Lamports).to.be.greaterThan(prePlayer1Lamports - 5000);
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 11: Fool's Mate — Full Game
  // ═════════════════════════════════════════════════════════════════════
  it("Fool's Mate — full game", async () => {
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS);
    const { chessMatchPda, escrowPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      betAmount,
      "foolsmate"
    );

    // ── Fool's Mate sequence ──────────────────────────────────────────
    // 1. White: f2-f3  (row:1,col:5 -> row:2,col:5)
    await makeMove(program, chessMatchPda, player1, 1, 5, 2, 5);
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ black: {} }, "Should be Black's turn after f3");
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} });

    // 2. Black: e7-e5  (row:6,col:4 -> row:4,col:4)
    await makeMove(program, chessMatchPda, player2, 6, 4, 4, 4);
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} }, "Should be White's turn after e5");
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} });

    // 3. White: g2-g4  (row:1,col:6 -> row:3,col:6)
    await makeMove(program, chessMatchPda, player1, 1, 6, 3, 6);
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ black: {} }, "Should be Black's turn after g4");
    expect(matchAccount.gameStatus).to.deep.equal({ active: {} });

    // 4. Black: Qd8-h4#  (row:7,col:3 -> row:3,col:7) — checkmate!
    await makeMove(program, chessMatchPda, player2, 7, 3, 3, 7);

    // Verify checkmate detected
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.gameStatus).to.deep.equal(
      { blackWins: {} },
      "Game should end with Black wins by checkmate"
    );
    expect(matchAccount.gameEndReason).to.deep.equal(
      { checkmate: {} },
      "End reason should be Checkmate"
    );
    expect(matchAccount.payoutProcessed).to.equal(false);

    // Verify the queen is on h4
    const queenSquare = matchAccount.board[3][7]; // row=3, col=7 (h4)
    expect(queenSquare).to.deep.equal({
      pieceType: { queen: {} },
      color: { black: {} },
    });

    // ── Process settlement after checkmate ─────────────────────────────
    const prePlayer2Balance = await getAccount(provider.connection, player2Ata);

    await program.methods
      .processMatchSettlement()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: escrowPda,
        playerOneAta: player1Ata,
        playerTwoAta: player2Ata,
        platformFeeAta: platformFeeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify settlement
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.payoutProcessed).to.equal(true);

    // Black (player2) wins and receives the pot minus fee
    const postPlayer2Balance = await getAccount(provider.connection, player2Ata);
    const fee = BigInt(betAmount.mul(new BN(2)).mul(new BN(2)).div(new BN(100)).toString());
    const expectedWinnings = BigInt(betAmount.mul(new BN(2)).toString()) - fee;
    expect(
      BigInt(postPlayer2Balance.amount.toString()) - BigInt(prePlayer2Balance.amount.toString())
    ).to.equal(expectedWinnings);

    // Escrow should be empty
    const escrowBalance = await getAccount(provider.connection, escrowPda);
    expect(BigInt(escrowBalance.amount.toString())).to.equal(BigInt(0));
  });

  // ═════════════════════════════════════════════════════════════════════
  // Test 12: Set and Use Session Key
  // ═════════════════════════════════════════════════════════════════════
  it("set and use session key", async () => {
    const betAmount = new BN(100 * 10 ** TOKEN_DECIMALS);
    const { chessMatchPda } = await createAndJoinMatch(
      program, provider, player1, player2,
      mint, player1Ata, player2Ata, platformFeeWallet.publicKey,
      betAmount,
      "session"
    );

    // Generate a session keypair
    const sessionKey = Keypair.generate();

    // Fund the session key from the payer wallet (avoids faucet rate limits)
    const walletPayer = (provider.wallet as any).payer as Keypair;
    const fundSessionTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: walletPayer.publicKey,
        toPubkey: sessionKey.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(provider.connection, fundSessionTx, [walletPayer]);

    // Player1 sets a session key with 1-hour expiry
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);
    await program.methods
      .setSessionKey(sessionKey.publicKey, expiresAt)
      .accounts({
        chessMatch: chessMatchPda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    // Verify session key is set
    let matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.sessionSigner.toBase58()).to.equal(sessionKey.publicKey.toBase58());
    expect(matchAccount.sessionExpiresAt.toString()).to.equal(expiresAt.toString());

    // Make a move using the session key signer (e2-e4)
    await program.methods
      .makeMove({ fromRow: 1, fromCol: 4, toRow: 3, toCol: 4, promotion: null })
      .accounts({
        chessMatch: chessMatchPda,
        player: sessionKey.publicKey, // session key signs instead of player1
      })
      .signers([sessionKey])
      .rpc();

    // Verify move was accepted
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ black: {} });

    // Player1 revokes the session key
    await program.methods
      .revokeSessionKey()
      .accounts({
        chessMatch: chessMatchPda,
        player: player1.publicKey,
      })
      .signers([player1])
      .rpc();

    // Verify session key is cleared
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.sessionSigner.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(matchAccount.sessionExpiresAt.toString()).to.equal(new BN(0).toString());

    // Now try to make a move with the revoked session key — must be rejected
    let errorCaught = false;
    try {
      await program.methods
        .makeMove({ fromRow: 6, fromCol: 4, toRow: 4, toCol: 4, promotion: null }) // e7-e5 by Black
        .accounts({
          chessMatch: chessMatchPda,
          player: sessionKey.publicKey, // revoked session key — should fail
        })
        .signers([sessionKey])
        .rpc();
    } catch (err: any) {
      errorCaught = true;
      const logs = err?.logs?.join?.(" ") ?? err?.message ?? "";
      expect(logs).to.satisfy((s: string) =>
        s.includes("UnauthorizedSigner") ||
        s.includes("Unauthorized") ||
        s.includes("6041")
      );
    }
    expect(errorCaught).to.equal(true, "Revoked session key should be rejected");

    // But player2 can still move normally (it's Black's turn)
    await makeMove(program, chessMatchPda, player2, 6, 4, 4, 4); // e7-e5
    matchAccount = await program.account.chessMatch.fetch(chessMatchPda);
    expect(matchAccount.currentTurn).to.deep.equal({ white: {} });
  });
});
