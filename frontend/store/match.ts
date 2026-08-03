import { atom } from "jotai";

// Core match state
export const matchFenAtom = atom<string>(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
);

export const matchMovesAtom = atom<string[]>([]);

export type MatchStatus =
  | "in_progress"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resign"
  | "timeout";

export const matchStatusAtom = atom<MatchStatus>("in_progress");

export const matchIdAtom = atom<string | null>(null);

export const matchConfigAtom = atom<{
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: number;
  wagerToken: string;
  timeControl: { minutes: number; increment: number };
} | null>(null);

// Derived: whose turn is it?
export const currentTurnAtom = atom<"white" | "black">((get) => {
  const fen = get(matchFenAtom);
  // FEN format: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  const parts = fen.split(" ");
  return parts[1] === "w" ? "white" : "black";
});

// Derived: is the game over?
export const isGameOverAtom = atom<boolean>((get) => {
  const status = get(matchStatusAtom);
  return status !== "in_progress";
});
