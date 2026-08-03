"use client";

import { cn } from "@/lib/utils";

interface CapturedPiecesProps {
  whiteCaptured: string[]; // piece symbols (e.g., "p", "n", "b", "r", "q")
  blackCaptured: string[];
  side: "white" | "black";
  className?: string;
}

/** Unicode chess piece symbols for display */
const PIECE_UNICODE: Record<string, { white: string; black: string }> = {
  p: { white: "♙", black: "♟" },
  n: { white: "♘", black: "♞" },
  b: { white: "♗", black: "♝" },
  r: { white: "♖", black: "♜" },
  q: { white: "♕", black: "♛" },
};

/** Point values for sorting by material */
const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

export function CapturedPieces({
  whiteCaptured,
  blackCaptured,
  side,
  className,
}: CapturedPiecesProps) {
  const captured = side === "white" ? blackCaptured : whiteCaptured;
  const displayColor = side === "white" ? "black" : "white";

  // Sort captured pieces by value (highest first)
  const sorted = [...captured].sort(
    (a, b) => (PIECE_VALUE[b] ?? 0) - (PIECE_VALUE[a] ?? 0)
  );

  const advantage =
    PIECE_VALUE[side === "white" ? "w" : "b"] ??
    (() => {
      const ownTotal = (side === "white" ? whiteCaptured : blackCaptured).reduce(
        (sum, p) => sum + (PIECE_VALUE[p] ?? 0),
        0
      );
      const oppTotal = (side === "white" ? blackCaptured : whiteCaptured).reduce(
        (sum, p) => sum + (PIECE_VALUE[p] ?? 0),
        0
      );
      return ownTotal - oppTotal;
    })();

  return (
    <div className={cn("glass-card p-3", className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">
          {side === "white" ? "Captured by White" : "Captured by Black"}
        </span>
        {advantage > 0 && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
            +{advantage}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 font-mono text-lg">
        {sorted.map((piece, i) => {
          const unicode = PIECE_UNICODE[piece.toLowerCase()]?.[displayColor];
          return unicode ? (
            <span key={`${piece}-${i}`} className="leading-none">
              {unicode}
            </span>
          ) : null;
        })}
        {sorted.length === 0 && (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </div>
    </div>
  );
}
