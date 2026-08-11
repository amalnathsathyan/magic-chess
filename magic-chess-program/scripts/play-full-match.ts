/**
 * Full chess match on Solana devnet — 16+ half-moves (8+ per side).
 *
 * Usage: npx tsx scripts/play-full-match.ts
 *
 * Flow: create → join (black) → delegate both → session keys for both →
 *       play 16 alternating half-moves → report final FEN, move list, errors.
 *
 * White = CLI wallet (~/.config/solana/id.json).
 * Black = generated keypair.
 * Blitz 3min, zero bet, WSOL.
 *
 * Uses chess.js to compute reasonable moves from the on-chain FEN.
 */

import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import * as solanaWeb3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { Chess } from "chess.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = solanaWeb3;

const { NATIVE_MINT, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } = splToken;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ROUTER_RPC = "https://devnet-router.magicblock.app/";
const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const SESSION_PROGRAM_ID = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// Discriminator for `create_session_v2` (MagicBlock SessionKeys)
const CREATE_SESSION_V2 = Buffer.from([223, 233, 108, 7, 65, 194, 235, 38]);

// Blitz: 3 minutes per player
const MOVE_TIMEOUT_SECONDS = 180;

// 16 half-moves = 8 per side (plenty for a proper opening + midgame)
const TOTAL_MOVES = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadWallet(): Keypair {
  const p = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
}

function createSessionInstruction(input: {
  authority: PublicKey;
  sessionSigner: PublicKey;
  sessionToken: PublicKey;
}): TransactionInstruction {
  const data = Buffer.alloc(28);
  CREATE_SESSION_V2.copy(data);
  data[8] = 1;  // bump (placeholder, SessionKeys tolerates mild bumps)
  data[9] = 1;  // top_up: true
  data[10] = 1; // valid_until: some flag
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3_300), 11); // 55 min expiry
  data[19] = 1;
  data.writeBigUInt64LE(2_000_000n, 20); // lamports
  return new TransactionInstruction({
    programId: SESSION_PROGRAM_ID,
    keys: [
      { pubkey: input.sessionToken, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function resolveEr(match: PublicKey): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const resp = await fetch(ROUTER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [match.toBase58()],
      }),
    });
    const body = (await resp.json()) as { result?: { isDelegated?: boolean; fqdn?: string } };
    if (body.result?.isDelegated && body.result.fqdn) {
      const url = body.result.fqdn.startsWith("http")
        ? body.result.fqdn
        : `https://${body.result.fqdn}`;
      console.log(`  ER resolved on attempt ${attempt + 1}: ${url}`);
      return url;
    }
    await delay(1_500);
  }
  throw new Error("Router did not expose the delegated match after 60 attempts");
}

// ---------------------------------------------------------------------------
// Board → FEN
// ---------------------------------------------------------------------------

const PIECE_CHAR: Record<string, string> = {
  Pawn: "p",
  Knight: "n",
  Bishop: "b",
  Rook: "r",
  Queen: "q",
  King: "k",
};

interface DecodedMatch {
  match_id: string;
  board: Array<Array<{ piece_type: Record<string, object>; color: Record<string, object> } | null>>;
  current_turn: Record<string, object>;
  castling_rights: {
    white_kingside: boolean;
    white_queenside: boolean;
    black_kingside: boolean;
    black_queenside: boolean;
  };
  en_passant_target: { row: number; col: number } | null;
  halfmove_clock: number;
  fullmove_number: number;
  game_status: Record<string, object>;
  player_one: PublicKey;
  player_two: PublicKey;
  white_player: PublicKey;
  black_player: PublicKey;
}

function boardToFen(state: DecodedMatch): string {
  const parts: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let empty = 0;
    let rankStr = "";
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          rankStr += empty.toString();
          empty = 0;
        }
        const pType = Object.keys(piece.piece_type)[0];
        const color = Object.keys(piece.color)[0];
        const ch = PIECE_CHAR[pType] ?? "?";
        rankStr += color === "White" ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) rankStr += empty.toString();
    parts.push(rankStr);
  }
  const placement = parts.join("/");

  const active = Object.keys(state.current_turn)[0] === "White" ? "w" : "b";

  let castling = "";
  if (state.castling_rights?.white_kingside) castling += "K";
  if (state.castling_rights?.white_queenside) castling += "Q";
  if (state.castling_rights?.black_kingside) castling += "k";
  if (state.castling_rights?.black_queenside) castling += "q";
  if (!castling) castling = "-";

  let ep = "-";
  if (state.en_passant_target) {
    const file = String.fromCharCode(97 + state.en_passant_target.col);
    const rank = state.en_passant_target.row + 1;
    ep = `${file}${rank}`;
  }

  const hm = state.halfmove_clock ?? 0;
  const fm = state.fullmove_number ?? 1;

  return `${placement} ${active} ${castling} ${ep} ${hm} ${fm}`;
}

function printBoard(state: DecodedMatch): void {
  console.log("\n  a b c d e f g h");
  for (let row = 7; row >= 0; row--) {
    const line = [`${row + 1} `];
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (!piece) {
        line.push(".");
      } else {
        const pType = Object.keys(piece.piece_type)[0];
        const color = Object.keys(piece.color)[0];
        const ch = PIECE_CHAR[pType] ?? "?";
        line.push(color === "White" ? ch.toUpperCase() : ch);
      }
    }
    console.log(line.join(" "));
  }
  console.log("  a b c d e f g h\n");
}

// ---------------------------------------------------------------------------
// Move picker (chess.js heuristics)
// ---------------------------------------------------------------------------

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

function pickMove(chess: Chess): { from: string; to: string; promotion?: string } | null {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const scored = moves.map((m) => {
    let score = 0;
    // Captures: value of captured piece
    if (m.captured) score += (PIECE_VALUES[m.captured] ?? 0) * 10;
    // Checks are good
    if (m.san.includes("+")) score += 5;
    // Centralization
    if (CENTER_SQUARES.has(m.to)) score += 2;
    // Promotions are huge
    if (m.promotion) score += 80;
    // Castling (develop king)
    if (m.san === "O-O" || m.san === "O-O-O") score += 3;
    // Develop knights and bishops early
    if (["n", "b"].includes(m.piece) && parseInt(m.from[1]) <= 2) score += 4;
    // Slight randomness to avoid repetitive games
    score += Math.random() * 1.0;
    return { move: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function algebraicToRowCol(sq: string): { row: number; col: number } {
  return { col: sq.charCodeAt(0) - 97, row: parseInt(sq[1]) - 1 };
}

function promotionToAnchor(p: string): Record<string, object> | null {
  const map: Record<string, Record<string, object>> = {
    q: { Queen: {} },
    r: { Rook: {} },
    b: { Bishop: {} },
    n: { Knight: {} },
  };
  return map[p] ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Magic Chess — Full Match on Devnet (Blitz 3min)   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const movedList: string[] = [];

  // ---- 1. Setup ----
  const connection = new solanaWeb3.Connection(BASE_RPC, "confirmed");
  const white = loadWallet();
  const black = Keypair.generate();
  const whiteSession = Keypair.generate();
  const blackSession = Keypair.generate();

  console.log(`White wallet : ${white.publicKey.toBase58()}`);
  console.log(`Black wallet : ${black.publicKey.toBase58()}`);
  console.log(`White session: ${whiteSession.publicKey.toBase58()}`);
  console.log(`Black session: ${blackSession.publicKey.toBase58()}`);

  // ---- 2. Match ID & PDAs ----
  const matchId = `mc-${Date.now().toString(16).padStart(12, "0")}${whiteSession.publicKey
    .toBuffer()
    .subarray(0, 4)
    .toString("hex")}`.slice(0, 23);

  const [match] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const [whiteSessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      PROGRAM_ID.toBuffer(),
      whiteSession.publicKey.toBuffer(),
      white.publicKey.toBuffer(),
    ],
    SESSION_PROGRAM_ID
  );
  const [blackSessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      PROGRAM_ID.toBuffer(),
      blackSession.publicKey.toBuffer(),
      black.publicKey.toBuffer(),
    ],
    SESSION_PROGRAM_ID
  );
  const [bufferPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), match.toBuffer()],
    PROGRAM_ID
  );
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), match.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), match.toBuffer()],
    DELEGATION_PROGRAM_ID
  );

  console.log(`\nMatch ID     : ${matchId}`);
  console.log(`Match PDA    : ${match.toBase58()}`);
  console.log(`Escrow PDA   : ${escrow.toBase58()}`);

  // ---- 3. Fund black ----
  console.log("\n--- [1/10] Funding black ---");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: white.publicKey,
      toPubkey: black.publicKey,
      lamports: 10_000_000,
    })
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [white]);
  console.log(`  Funded black 0.01 SOL: ${fundSig.slice(0, 44)}...`);

  // ---- 4. Create ATAs ----
  console.log("\n--- [2/10] Creating token accounts (WSOL) ---");
  const whiteAta = (await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, white.publicKey)).address;
  const blackAta = (await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, black.publicKey)).address;
  console.log(`  White ATA: ${whiteAta.toBase58()}`);
  console.log(`  Black ATA: ${blackAta.toBase58()}`);

  // ---- 5. Initialize match ----
  console.log("\n--- [3/10] Initializing match (Blitz 3min, zero bet) ---");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(white), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const createSig = await program.methods
    .initializeMatch(
      matchId,
      new anchor.BN(0),            // bet = 0
      new anchor.BN(MOVE_TIMEOUT_SECONDS),  // 180s = Blitz 3min
      100,                          // 1% platform fee
      white.publicKey,              // fee wallet
      false                         // no prediction
    )
    .accounts({
      chessMatch: match,
      playerSigner: white.publicKey,
      rentPayer: white.publicKey,
      bettingTokenMintAccount: NATIVE_MINT,
      playerTokenAccount: whiteAta,
      matchEscrowTokenAccount: escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  Initialize tx: ${createSig}`);

  // ---- 6. Join match as black ----
  console.log("\n--- [4/10] Joining match as black ---");
  const blackProvider = new anchor.AnchorProvider(connection, new anchor.Wallet(black), provider.opts);
  const blackProgram = new anchor.Program(idl as never, blackProvider);

  const joinSig = await blackProgram.methods
    .joinMatch(new anchor.BN(0))
    .accounts({
      chessMatch: match,
      playerTwoSigner: black.publicKey,
      playerTokenAccount: blackAta,
      matchEscrowTokenAccount: escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  Join tx: ${joinSig}`);

  // ---- 7. Create session tokens (L1, SessionKeys program) ----
  console.log("\n--- [5/10] Creating session tokens ---");

  const whiteSessionSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createSessionInstruction({
        authority: white.publicKey,
        sessionSigner: whiteSession.publicKey,
        sessionToken: whiteSessionToken,
      })
    ),
    [white, whiteSession],
    { commitment: "confirmed" }
  );
  console.log(`  White session tx: ${whiteSessionSig.slice(0, 44)}...`);

  const blackSessionSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createSessionInstruction({
        authority: black.publicKey,
        sessionSigner: blackSession.publicKey,
        sessionToken: blackSessionToken,
      })
    ),
    [black, blackSession],
    { commitment: "confirmed" }
  );
  console.log(`  Black session tx: ${blackSessionSig.slice(0, 44)}...`);

  // ---- 8. Delegate match to MagicBlock ER ----
  console.log("\n--- [6/10] Delegating match to MagicBlock ER ---");
  const delegateSig = await program.methods
    .delegateMatch()
    .accountsStrict({
      payer: white.publicKey,
      player: white.publicKey,
      bufferChessMatch: bufferPda,
      delegationRecordChessMatch: delegationRecord,
      delegationMetadataChessMatch: delegationMetadata,
      chessMatch: match,
      ownerProgram: PROGRAM_ID,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  Delegate tx: ${delegateSig}`);

  // ---- 9. Resolve ER endpoint ----
  console.log("\n--- [7/10] Resolving ER endpoint ---");
  const erEndpoint = await resolveEr(match);
  const erConnection = new solanaWeb3.Connection(erEndpoint, "confirmed");

  // ---- 10. Play moves ----
  console.log(`\n--- [8/10] Playing ${TOTAL_MOVES} half-moves (${TOTAL_MOVES / 2} per side) ---\n`);

  const coder = new anchor.BorshCoder(idl as never);
  const errors: string[] = [];

  for (let moveNum = 0; moveNum < TOTAL_MOVES; moveNum++) {
    console.log(`┌─ Move ${moveNum + 1}/${TOTAL_MOVES} ───────────────────────────────┐`);

    // Read current board from ER
    let accountInfo: solanaWeb3.AccountInfo<Buffer> | null = null;
    let retries = 0;
    while (retries < 5) {
      accountInfo = await erConnection.getAccountInfo(match);
      if (accountInfo) break;
      retries++;
      console.log(`  ⚠ ER account not ready, retry ${retries}/5...`);
      await delay(2_000);
    }
    if (!accountInfo) {
      const err = `Match account not found on ER at move ${moveNum + 1}`;
      console.log(`  ❌ ${err}`);
      errors.push(err);
      break;
    }

    const state = coder.accounts.decode("ChessMatch", accountInfo.data) as unknown as DecodedMatch;

    // Check game status
    const status = Object.keys(state.game_status)[0];
    if (status !== "Active") {
      console.log(`  Game status: ${status} — stopping.`);
      break;
    }

    const turn = Object.keys(state.current_turn)[0]; // "White" or "Black"
    const fen = boardToFen(state);
    console.log(`  Turn: ${turn}  |  FEN: ${fen}`);

    const chess = new Chess(fen);

    // Pick a move using heuristics
    const chosen = pickMove(chess);
    if (!chosen) {
      console.log(`  No legal moves for ${turn}. Game over.`);
      break;
    }

    const fromRC = algebraicToRowCol(chosen.from);
    const toRC = algebraicToRowCol(chosen.to);
    const promotionAnchor = chosen.promotion ? promotionToAnchor(chosen.promotion) : null;

    const sanNotation = `${chosen.from}→${chosen.to}${chosen.promotion ? "=" + chosen.promotion : ""}`;
    console.log(`  Chosen: ${chosen.san}  (${sanNotation})`);

    // Determine which session to use
    const isWhite = turn === "White";
    const sessionSigner = isWhite ? whiteSession : blackSession;
    const sessionToken = isWhite ? whiteSessionToken : blackSessionToken;

    // Create ER provider with the appropriate session wallet
    const erProvider = new anchor.AnchorProvider(
      erConnection,
      new anchor.Wallet(sessionSigner),
      { commitment: "confirmed", preflightCommitment: "confirmed" }
    );
    const erProgram = new anchor.Program(idl as never, erProvider);

    try {
      const moveSig = await erProgram.methods
        .makeMove({
          fromRow: fromRC.row,
          fromCol: fromRC.col,
          toRow: toRC.row,
          toCol: toRC.col,
          promotion: promotionAnchor as any,
        } as any)
        .accounts({
          chessMatch: match,
          player: sessionSigner.publicKey,
          sessionToken,
        } as any)
        .signers([sessionSigner])
        .rpc();

      console.log(`  ✅ Tx: ${moveSig.slice(0, 44)}...`);
      movedList.push(`${moveNum + 1}. ${turn} ${chosen.san}`);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      const errStr = `Move ${moveNum + 1} (${turn} ${chosen.san}) failed: ${msg}`;
      console.log(`  ❌ ${errStr}`);
      errors.push(errStr);
    }

    console.log(`└──────────────────────────────────────────────────────┘`);
    await delay(2_500);
  }

  // ---- 11. Final state ----
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║               FINAL REPORT                          ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  let finalFen = "unknown";
  let finalStatus = "unknown";
  let finalTurn = "unknown";

  const finalAccount = await erConnection.getAccountInfo(match);
  if (finalAccount) {
    const finalState = coder.accounts.decode("ChessMatch", finalAccount.data) as unknown as DecodedMatch;
    finalFen = boardToFen(finalState);
    finalStatus = Object.keys(finalState.game_status)[0];
    finalTurn = Object.keys(finalState.current_turn)[0];

    console.log(`\nStatus       : ${finalStatus}`);
    console.log(`Turn         : ${finalTurn}`);
    console.log(`FEN          : ${finalFen}`);
    console.log(`Fullmove #   : ${finalState.fullmove_number}`);
    console.log(`Halfmove clk : ${finalState.halfmove_clock}`);

    printBoard(finalState);
  } else {
    console.log("  ❌ Final account not found on ER");
    errors.push("Final account not found on ER");
  }

  // ---- 12. Move list & summary ----
  console.log("Move list:");
  movedList.forEach((m) => console.log(`  ${m}`));

  if (errors.length > 0) {
    console.log(`\n⚠ Errors (${errors.length}):`);
    errors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log("\n✅ No errors — all moves succeeded.");
  }

  console.log(`\n🔗 Explorer: https://solscan.io/account/${match.toBase58()}?cluster=devnet`);
  console.log(`Match ID  : ${matchId}`);
  console.log(`Match PDA : ${match.toBase58()}`);
  console.log(`ER        : ${erEndpoint}`);

  // Also check L1 state
  console.log("\n--- L1 fallback check ---");
  try {
    const l1Info = await connection.getAccountInfo(match);
    if (l1Info) {
      const l1State = coder.accounts.decode("ChessMatch", l1Info.data) as unknown as DecodedMatch;
      console.log(`  L1 status : ${Object.keys(l1State.game_status)[0]}`);
      console.log(`  L1 turn   : ${Object.keys(l1State.current_turn)[0]}`);
      console.log(`  L1 FEN    : ${boardToFen(l1State)}`);
    } else {
      console.log("  Match not found on L1 (delegated — this is expected).");
    }
  } catch (e: any) {
    console.log(`  L1 check note: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((error) => {
  console.error("\n╔══════════════════════════════════════════════════════╗");
  console.error("║                    FATAL ERROR                      ║");
  console.error("╚══════════════════════════════════════════════════════╝");
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    const lines = error.stack.split("\n").slice(0, 8);
    console.error(lines.join("\n"));
  }
  process.exitCode = 1;
});
