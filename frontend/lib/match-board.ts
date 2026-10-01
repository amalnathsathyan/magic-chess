import type { Square } from "chess.js";
import { boardToFen, type ChessMatch, type Piece } from "@magic-chess/sdk";

/** Shared helpers for rendering an on-chain ChessMatch. */

export function normalizeBoardPiece(piece: Piece | null): {
  pieceType: "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";
  color: "White" | "Black";
} | null {
  if (!piece) return null;
  const names = {
    pawn: "Pawn",
    knight: "Knight",
    bishop: "Bishop",
    rook: "Rook",
    queen: "Queen",
    king: "King",
  } as const;
  return {
    pieceType: names[piece.pieceType],
    color: piece.color === "white" ? "White" : "Black",
  };
}

export function matchToFen(match: ChessMatch): string | null {
  if (match.board.length !== 8) return null;
  try {
    return boardToFen(
      match.board.map((row) => row.map(normalizeBoardPiece)),
      match.currentTurn,
      match.castlingRights,
      match.enPassantTarget,
      match.halfmoveClock,
      match.fullmoveNumber
    );
  } catch {
    return null;
  }
}

/** Half-moves already played in the position. */
export function pliesPlayed(match: Pick<ChessMatch, "fullmoveNumber" | "currentTurn">): number {
  return (match.fullmoveNumber - 1) * 2 + (match.currentTurn === "black" ? 1 : 0);
}

/** "12. e4" / "12… Nf6" style label for a ply. */
export function plyLabel(ply: number): string {
  const moveNumber = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${moveNumber}. White` : `${moveNumber}… Black`;
}

export function formatRemaining(milliseconds: number): { text: string; isLow: boolean } {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return {
    text: mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`,
    isLow: seconds <= 10,
  };
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}
