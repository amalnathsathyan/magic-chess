import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Chess } from "chess.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const BASE_RPC = "https://api.devnet.solana.com";
const ROUTER_RPC = "https://devnet-router.magicblock.app/";
const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const SESSION_PROGRAM_ID = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const CREATE_SESSION_V2 = Buffer.from([223, 233, 108, 7, 65, 194, 235, 38]);

const MATCH_ID = "mc-abea8fd34c2344d6b6bb";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadWallet(): Keypair {
  const walletPath = `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

function createSessionInstruction(input: {
  authority: PublicKey;
  sessionSigner: PublicKey;
  sessionToken: PublicKey;
}): TransactionInstruction {
  const data = Buffer.alloc(28);
  CREATE_SESSION_V2.copy(data);
  data[8] = 1;
  data[9] = 1;
  data[10] = 1;
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3_300), 11);
  data[19] = 1;
  data.writeBigUInt64LE(2_000_000n, 20);
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

async function resolveEr(matchPda: PublicKey): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(ROUTER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [matchPda.toBase58()],
      }),
    });
    const body = (await response.json()) as {
      result?: { isDelegated?: boolean; fqdn?: string };
    };
    if (body.result?.isDelegated && body.result.fqdn) {
      return body.result.fqdn.startsWith("http")
        ? body.result.fqdn
        : `https://${body.result.fqdn}`;
    }
    await delay(1_000);
  }
  throw new Error("Router did not expose the delegated match");
}

// Piece type mapping
const PIECE_TYPE_NAMES: Record<number, string> = {
  0: "p",
  1: "n",
  2: "b",
  3: "r",
  4: "q",
  5: "k",
};

// Convert raw account data to board FEN
function decodeBoard(rawBoardData: Buffer): string {
  // The board is [[Option<Piece>; 8]; 8]
  // Option<Piece> = 1 byte (Some/None) + 1 byte (piece_type) + 1 byte (color)
  // = 3 bytes per square, 8x8 = 64 squares = 192 bytes
  let offset = 0;
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let rowStr = "";
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const optionTag = rawBoardData[offset];
      const pieceType = rawBoardData[offset + 1];
      const color = rawBoardData[offset + 2];
      offset += 3;

      if (optionTag === 0) {
        // None (empty square)
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rowStr += emptyCount.toString();
          emptyCount = 0;
        }
        const pieceChar = PIECE_TYPE_NAMES[pieceType] || "?";
        rowStr += color === 0 ? pieceChar.toUpperCase() : pieceChar;
      }
    }
    if (emptyCount > 0) {
      rowStr += emptyCount.toString();
    }
    rows.push(rowStr);
  }
  return rows.join("/");
}

// Fetch match state and decode
async function fetchMatchState(
  connection: anchor.web3.Connection,
  matchPda: PublicKey
): Promise<{
  matchData: any;
  boardFen: string;
  currentTurn: number; // 0=White, 1=Black
  gameStatus: number;
  castlingRights: any;
  enPassantTarget: any;
  halfmoveClock: number;
  fullmoveNumber: number;
  whitePlayer: PublicKey;
  blackPlayer: PublicKey;
}> {
  const accountInfo = await connection.getAccountInfo(matchPda);
  if (!accountInfo) throw new Error(`Match account ${matchPda.toBase58()} not found`);

  const raw = accountInfo.data;
  let offset = 8; // skip discriminator

  // match_id: String (4 bytes length + data)
  const matchIdLen = raw.readUInt32LE(offset);
  offset += 4 + matchIdLen;

  // players: [Pubkey; 2] = 64 bytes
  const whitePlayer = new PublicKey(raw.subarray(offset, offset + 32));
  offset += 32;
  const blackPlayer = new PublicKey(raw.subarray(offset, offset + 32));
  offset += 32;

  // current_player_idx: u8
  const currentPlayerIdx = raw[offset];
  offset += 1;

  // current_turn: PlayerColor (u8)
  const currentTurn = raw[offset];
  offset += 1;

  // last_move_timestamp: i64 (8 bytes)
  const lastMoveTimestamp = Number(raw.readBigInt64LE(offset));
  offset += 8;

  // move_timeout_duration: i64 (8 bytes)
  const moveTimeoutDuration = Number(raw.readBigInt64LE(offset));
  offset += 8;

  // game_status: GameStatus (u8)
  const gameStatus = raw[offset];
  offset += 1;

  // game_end_reason: Option<GameEndReason> (1 byte tag + 1 byte value)
  const endReasonTag = raw[offset];
  const endReasonValue = raw[offset + 1];
  offset += 2;

  // board: [[Option<Piece>; 8]; 8] = 192 bytes
  const boardRaw = raw.subarray(offset, offset + 192);
  offset += 192;

  // castling_rights: CastlingRights (4 bytes: bool,bool,bool,bool)
  const castlingRights = {
    whiteKingside: raw[offset] === 1,
    whiteQueenside: raw[offset + 1] === 1,
    blackKingside: raw[offset + 2] === 1,
    blackQueenside: raw[offset + 3] === 1,
  };
  offset += 4;

  // en_passant_target: Option<EnPassantSquare> (1 byte tag + 1 byte row + 1 byte col)
  const epTag = raw[offset];
  const enPassantTarget =
    epTag === 0
      ? null
      : { row: raw[offset + 1], col: raw[offset + 2] };
  offset += 3;

  // halfmove_clock: u8
  const halfmoveClock = raw[offset];
  offset += 1;

  // fullmove_number: u16
  const fullmoveNumber = raw.readUInt16LE(offset);
  offset += 2;

  const boardFen = decodeBoard(boardRaw);

  return {
    matchData: null,
    boardFen,
    currentTurn,
    gameStatus,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
    whitePlayer,
    blackPlayer,
  };
}

function buildFullFen(state: {
  boardFen: string;
  currentTurn: number;
  castlingRights: { whiteKingside: boolean; whiteQueenside: boolean; blackKingside: boolean; blackQueenside: boolean };
  enPassantTarget: { row: number; col: number } | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}): string {
  const turn = state.currentTurn === 0 ? "w" : "b";

  let castling = "";
  if (state.castlingRights.whiteKingside) castling += "K";
  if (state.castlingRights.whiteQueenside) castling += "Q";
  if (state.castlingRights.blackKingside) castling += "k";
  if (state.castlingRights.blackQueenside) castling += "q";
  if (castling === "") castling = "-";

  let ep = "-";
  if (state.enPassantTarget) {
    const col = String.fromCharCode(97 + state.enPassantTarget.col); // a-h
    const row = 8 - state.enPassantTarget.row; // 8-1
    ep = `${col}${row}`;
  }

  return `${state.boardFen} ${turn} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

async function main() {
  console.log("=== Magic Chess: Playing as BLACK ===\n");

  const connection = new anchor.web3.Connection(BASE_RPC, "confirmed");
  const wallet = loadWallet();
  console.log("Wallet:", wallet.publicKey.toBase58());

  // Derive match PDA
  const [matchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(MATCH_ID)],
    PROGRAM_ID
  );
  console.log("Match PDA:", matchPda.toBase58());

  // Fetch and decode match state
  const state = await fetchMatchState(connection, matchPda);
  const fen = buildFullFen(state);
  console.log("\n--- Current Board State ---");
  console.log("FEN:", fen);
  console.log("Current Turn:", state.currentTurn === 0 ? "WHITE" : "BLACK");
  console.log("Game Status:", state.gameStatus, "(0=Waiting, 1=Active, 2=WhiteWins, 3=BlackWins, 4=Draw, 5=Aborted)");
  console.log("White:", state.whitePlayer.toBase58());
  console.log("Black:", state.blackPlayer.toBase58());
  console.log("Fullmove Number:", state.fullmoveNumber);

  // Print board visually
  console.log("\nBoard:");
  const rows = state.boardFen.split("/");
  for (let i = 0; i < 8; i++) {
    const rowLabel = 8 - i;
    let visualRow = "";
    for (const ch of rows[i]) {
      if (ch >= "1" && ch <= "8") {
        visualRow += " .".repeat(parseInt(ch));
      } else {
        visualRow += " " + ch;
      }
    }
    console.log(`${rowLabel} |${visualRow}`);
  }
  console.log("   -----------------");
  console.log("    a b c d e f g h");

  // Check if game is still active
  if (state.gameStatus !== 1) {
    console.log("\nGame is not active (status:", state.gameStatus, "). Exiting.");
    return;
  }

  // Verify it's black's turn
  if (state.currentTurn !== 1) {
    console.log("\nIt's WHITE's turn, not black's. Waiting or exiting.");
    return;
  }

  console.log("\nIt's BLACK's turn! Computing move...");

  // Create chess.js instance with current position
  const chess = new Chess(fen);
  console.log("Legal moves:", chess.moves({ verbose: true }).length);

  // Get all legal moves and pick a reasonable one
  const moves = chess.moves({ verbose: true });

  // Strategy: prioritize captures, then checks, then center control
  const captures = moves.filter((m) => m.captured);
  const checks = moves.filter((m) => m.san.includes("+"));
  const nonPawnCenter = moves.filter(
    (m) => m.piece !== "p" && (m.to === "d5" || m.to === "e5" || m.to === "d4" || m.to === "e4")
  );

  let chosenMove = null;
  if (captures.length > 0) {
    // Pick the highest value capture
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    captures.sort((a, b) => (pieceValues[b.captured!] || 0) - (pieceValues[a.captured!] || 0));
    chosenMove = captures[0];
    console.log("Chose capture:", chosenMove.san);
  } else if (checks.length > 0) {
    chosenMove = checks[0];
    console.log("Chose check:", chosenMove.san);
  } else if (nonPawnCenter.length > 0) {
    chosenMove = nonPawnCenter[0];
    console.log("Chose development:", chosenMove.san);
  } else {
    // Pick a random reasonable move
    chosenMove = moves[Math.floor(Math.random() * moves.length)];
    console.log("Chose random move:", chosenMove.san);
  }

  console.log("\nMove details:");
  console.log("  From:", chosenMove.from, `(row=${8 - parseInt(chosenMove.from[1])}, col=${chosenMove.from.charCodeAt(0) - 97})`);
  console.log("  To:", chosenMove.to, `(row=${8 - parseInt(chosenMove.to[1])}, col=${chosenMove.to.charCodeAt(0) - 97})`);
  console.log("  Piece:", chosenMove.piece);
  console.log("  SAN:", chosenMove.san);
  if (chosenMove.captured) console.log("  Captures:", chosenMove.captured);
  if (chosenMove.promotion) console.log("  Promotion:", chosenMove.promotion);

  // Convert to the format expected by make_move instruction
  const fromRow = 8 - parseInt(chosenMove.from[1]);
  const fromCol = chosenMove.from.charCodeAt(0) - 97;
  const toRow = 8 - parseInt(chosenMove.to[1]);
  const toCol = chosenMove.to.charCodeAt(0) - 97;

  // Map promotion piece type
  const promotionMap: Record<string, number> = { q: 0, r: 1, b: 2, n: 3 };
  const promotion = chosenMove.promotion ? { queen: {}, rook: {}, bishop: {}, knight: {} }[chosenMove.promotion] || null : null;
  // Actually promotion in the instruction is a PieceType variant: 0=Queen, 1=Rook, 2=Bishop, 3=Knight
  // and it's wrapped in Option. The move instruction takes Move { from_row, from_col, to_row, to_col, promotion: Option<PieceType> }
  // Let me check the IDL

  // The IDL shows: make_move has args: { move: { from_row: u8, from_col: u8, to_row: u8, to_col: u8, promotion: option<...> } }
  // Let's use the program directly

  // First check if we need a session or if black already has one
  const blackSessionSigner = Keypair.generate();

  // Create session for black
  const [sessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      PROGRAM_ID.toBuffer(),
      blackSessionSigner.publicKey.toBuffer(),
      wallet.publicKey.toBuffer(), // we are the authority
    ],
    SESSION_PROGRAM_ID
  );

  console.log("\nCreating session for black...");
  console.log("  Session signer:", blackSessionSigner.publicKey.toBase58());
  console.log("  Session token:", sessionToken.toBase58());
  console.log("  Authority:", wallet.publicKey.toBase58());

  const sessionTx = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createSessionInstruction({
        authority: wallet.publicKey,
        sessionSigner: blackSessionSigner.publicKey,
        sessionToken,
      })
    ),
    [wallet, blackSessionSigner],
    { commitment: "confirmed" }
  );
  console.log("  Session created:", sessionTx);

  // Resolve ER endpoint
  console.log("\nResolving ER endpoint...");
  const erEndpoint = await resolveEr(matchPda);
  console.log("  ER Endpoint:", erEndpoint);

  // Connect to ER and make move
  const erConnection = new anchor.web3.Connection(erEndpoint, "confirmed");
  const erProvider = new anchor.AnchorProvider(
    erConnection,
    new anchor.Wallet(blackSessionSigner),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  const erProgram = new anchor.Program(idl as never, erProvider);

  console.log("\nSubmitting move...");
  console.log("  From: row", fromRow, "col", fromCol);
  console.log("  To: row", toRow, "col", toCol);
  console.log("  Promotion:", chosenMove.promotion || "none");

  // The move instruction expects a Move struct
  const promotionVariant = chosenMove.promotion
    ? (() => {
        const map: Record<string, any> = {
          q: { queen: {} },
          r: { rook: {} },
          b: { bishop: {} },
          n: { knight: {} },
        };
        return map[chosenMove.promotion!];
      })()
    : null;

  try {
    const moveSignature = await erProgram.methods
      .makeMove({
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotion: promotionVariant,
      })
      .accounts({
        chessMatch: matchPda,
        player: blackSessionSigner.publicKey,
        sessionToken,
      })
      .signers([blackSessionSigner])
      .rpc();
    console.log("  Move submitted:", moveSignature);
  } catch (err: any) {
    console.error("  Move failed:", err.message || err);
    // Try with different promotion format
    console.log("  Retrying with alternative promotion format...");
    const altPromotion = chosenMove.promotion
      ? (() => {
          const map: Record<string, any> = {
            q: { queen: {} },
            r: { rook: {} },
            b: { bishop: {} },
            n: { knight: {} },
          };
          return map[chosenMove.promotion!];
        })()
      : null;
    console.log("  Promotion variant:", JSON.stringify(altPromotion));
    throw err;
  }

  // Wait and check the new board
  await delay(3_000);

  console.log("\n--- New Board State ---");
  const newState = await fetchMatchState(connection, matchPda);
  const newFen = buildFullFen(newState);
  console.log("FEN:", newFen);
  console.log("Current Turn:", newState.currentTurn === 0 ? "WHITE" : "BLACK");

  // Print new board
  const newRows = newState.boardFen.split("/");
  for (let i = 0; i < 8; i++) {
    const rowLabel = 8 - i;
    let visualRow = "";
    for (const ch of newRows[i]) {
      if (ch >= "1" && ch <= "8") {
        visualRow += " .".repeat(parseInt(ch));
      } else {
        visualRow += " " + ch;
      }
    }
    console.log(`${rowLabel} |${visualRow}`);
  }
  console.log("   -----------------");
  console.log("    a b c d e f g h");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
