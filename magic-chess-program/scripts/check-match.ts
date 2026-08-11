import { readFileSync } from "node:fs";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Chess } from "chess.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const MATCH_ID = "mc-abea8fd34c2344d6b6bb";
const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");

function loadWallet(): Keypair {
  const walletPath = `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

// Anchor v0.30+ encodes enums as objects like { white: {} } or { black: {} }
function getEnumVariant(obj: any): string | null {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    return keys.length > 0 ? keys[0] : null;
  }
  return null;
}

function checkEnumVariant(obj: any, variant: string): boolean {
  return getEnumVariant(obj) === variant;
}

function buildFen(matchAccount: any): string {
  const fenRows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let fenRow = "";
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = matchAccount.board[row][col];
      if (piece === null || piece === undefined) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          fenRow += emptyCount;
          emptyCount = 0;
        }
        const pieceTypeName = getEnumVariant(piece.pieceType) || "?";
        const pieceTypeMap: Record<string, string> = {
          pawn: "p",
          knight: "n",
          bishop: "b",
          rook: "r",
          queen: "q",
          king: "k",
        };
        const p = pieceTypeMap[pieceTypeName] || "?";
        const isWhite = checkEnumVariant(piece.color, "white");
        fenRow += isWhite ? p.toUpperCase() : p;
      }
    }
    if (emptyCount > 0) fenRow += emptyCount;
    fenRows.push(fenRow);
  }
  const boardFen = fenRows.join("/");

  const turn = checkEnumVariant(matchAccount.currentTurn, "white") ? "w" : "b";

  let castling = "";
  if (matchAccount.castlingRights?.whiteKingside) castling += "K";
  if (matchAccount.castlingRights?.whiteQueenside) castling += "Q";
  if (matchAccount.castlingRights?.blackKingside) castling += "k";
  if (matchAccount.castlingRights?.blackQueenside) castling += "q";
  if (castling === "") castling = "-";

  let ep = "-";
  if (matchAccount.enPassantTarget) {
    const col = String.fromCharCode(97 + (matchAccount.enPassantTarget.col));
    const row = 8 - (matchAccount.enPassantTarget.row);
    ep = col + row;
  }

  return `${boardFen} ${turn} ${castling} ${ep} ${matchAccount.halfmoveClock} ${matchAccount.fullmoveNumber}`;
}

function printBoard(matchAccount: any) {
  console.log("Board:");
  for (let row = 0; row < 8; row++) {
    const rowLabel = 8 - row;
    let visualRow = "";
    for (let col = 0; col < 8; col++) {
      const piece = matchAccount.board[row][col];
      if (piece === null || piece === undefined) {
        visualRow += " .";
      } else {
        const pieceTypeName = getEnumVariant(piece.pieceType) || "?";
        const pieceTypeMap: Record<string, string> = {
          pawn: "p",
          knight: "n",
          bishop: "b",
          rook: "r",
          queen: "q",
          king: "k",
        };
        const p = pieceTypeMap[pieceTypeName] || "?";
        visualRow += " " + (checkEnumVariant(piece.color, "white") ? p.toUpperCase() : p);
      }
    }
    console.log(`${rowLabel} |${visualRow}`);
  }
  console.log("   -----------------");
  console.log("    a b c d e f g h");
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = loadWallet();
  console.log("Wallet:", wallet.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const [matchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(MATCH_ID)],
    PROGRAM_ID
  );
  console.log("Match PDA:", matchPda.toBase58());

  const mc = await program.account.chessMatch.fetch(matchPda);

  // Debug: check the type of board elements
  console.log("\n=== DEBUG: Anchor enum representations ===");
  console.log("currentTurn:", JSON.stringify(mc.currentTurn), "→ variant:", getEnumVariant(mc.currentTurn));
  console.log("gameStatus:", JSON.stringify(mc.gameStatus), "→ variant:", getEnumVariant(mc.gameStatus));
  console.log("gameEndReason:", JSON.stringify(mc.gameEndReason), "→ variant:", getEnumVariant(mc.gameEndReason));
  const samplePiece = mc.board[0][0];
  if (samplePiece) {
    console.log("board[0][0]:", JSON.stringify(samplePiece));
    console.log("  pieceType:", JSON.stringify(samplePiece.pieceType), "→", getEnumVariant(samplePiece.pieceType));
    console.log("  color:", JSON.stringify(samplePiece.color), "→", getEnumVariant(samplePiece.color));
  }
  console.log("board[0][7]:", JSON.stringify(mc.board[0][7]));
  console.log("board[1][0]:", JSON.stringify(mc.board[1][0]));
  console.log("board[1][1]:", JSON.stringify(mc.board[1][1]));

  console.log("\n=== MATCH STATE ===");
  console.log("Match ID:", mc.matchId);
  console.log("White:", mc.players[0].toBase58());
  console.log("Black:", mc.players[1].toBase58());
  console.log("Current Turn:", getEnumVariant(mc.currentTurn));
  console.log("Game Status:", getEnumVariant(mc.gameStatus));
  console.log("End Reason:", getEnumVariant(mc.gameEndReason));
  console.log("Last Move Timestamp:", new Date(Number(mc.lastMoveTimestamp) * 1000).toISOString());
  console.log("Move Timeout:", mc.moveTimeoutDuration?.toString(), "seconds");
  console.log("Fullmove Number:", mc.fullmoveNumber);
  console.log("Halfmove Clock:", mc.halfmoveClock);
  console.log("En Passant:", mc.enPassantTarget);
  console.log("Castling:", mc.castlingRights);
  console.log("Is Delegated:", mc.isDelegated);

  printBoard(mc);

  const fen = buildFen(mc);
  console.log("\nFEN:", fen);

  // Verify with chess.js
  try {
    const chess = new Chess(fen);
    console.log("\n=== CHESS.JS ANALYSIS ===");
    console.log("Turn:", chess.turn());
    console.log("Is Game Over:", chess.isGameOver());
    console.log("Is Check:", chess.isCheck());
    console.log("Is Checkmate:", chess.isCheckmate());
    console.log("Is Stalemate:", chess.isStalemate());
    console.log("Is Draw:", chess.isDraw());
    console.log("Legal Moves:", chess.moves().length);

    if (!chess.isGameOver()) {
      const moves = chess.moves();
      console.log("Sample moves:", moves.slice(0, 15).join(", "));
    }
  } catch (e: any) {
    console.log("Chess.js error:", e.message);
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
