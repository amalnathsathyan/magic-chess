import { Chess } from "chess.js";

/**
 * Validate a chess FEN string.
 * Returns the parsed Chess object if valid, null otherwise.
 */
export function validateFen(fen: string): Chess | null {
  try {
    const game = new Chess(fen);
    return game;
  } catch {
    return null;
  }
}

/**
 * Get the game result from a FEN string.
 */
export function getGameResult(fen: string): {
  status: "in_progress" | "checkmate" | "stalemate" | "draw";
  winner: "white" | "black" | null;
  turn: "white" | "black";
} {
  const game = new Chess(fen);
  const turn = game.turn() === "w" ? "white" : "black";

  if (game.isCheckmate()) {
    return {
      status: "checkmate",
      winner: turn === "white" ? "black" : "white",
      turn,
    };
  }
  if (game.isStalemate()) {
    return { status: "stalemate", winner: null, turn };
  }
  if (game.isDraw()) {
    return { status: "draw", winner: null, turn };
  }
  return { status: "in_progress", winner: null, turn };
}

/**
 * Shorten a Solana address for display.
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a move history array into PGN-like string.
 */
export function formatMoveHistory(moves: string[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const white = moves[i];
    const black = moves[i + 1] ?? "";
    pairs.push(`${num}. ${white} ${black}`.trim());
  }
  return pairs.join(" ");
}
