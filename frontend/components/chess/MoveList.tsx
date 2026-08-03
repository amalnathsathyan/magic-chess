"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface MoveListProps {
  moves: string[];
  fen?: string;
  currentMoveIndex?: number;
  className?: string;
}

export function MoveList({
  moves,
  fen,
  currentMoveIndex = -1,
  className,
}: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest move
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves]);

  const copyPGN = () => {
    const pgn = moves.reduce((acc, move, i) => {
      if (i % 2 === 0) return `${acc} ${Math.floor(i / 2) + 1}. ${move}`;
      return `${acc} ${move}`;
    }, "").trim();
    navigator.clipboard.writeText(pgn);
    toast.success("PGN copied to clipboard");
  };

  const copyFEN = () => {
    if (fen) {
      navigator.clipboard.writeText(fen);
      toast.success("FEN copied to clipboard");
    }
  };

  // Group moves into pairs (white, black)
  const movePairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  if (movePairs.length === 0) {
    return (
      <div
        className={cn(
          "glass-card flex h-full flex-col p-4 backdrop-blur-md bg-background/40",
          className
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-sm font-semibold text-muted">
            Moves
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">No moves yet</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "glass-card flex h-full flex-col p-4 backdrop-blur-md bg-background/40",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-semibold text-muted">
          Moves
        </h3>
        <div className="flex gap-2">
          <button
            onClick={copyPGN}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Copy PGN"
          >
            <Copy className="h-3 w-3" /> PGN
          </button>
          {fen && (
            <button
              onClick={copyFEN}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Copy FEN"
            >
              <Copy className="h-3 w-3" /> FEN
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-1 font-mono text-sm"
      >
        <table className="w-full">
          <tbody>
            {movePairs.map((pair, pairIdx) => {
              const whiteIdx = pairIdx * 2;
              const blackIdx = whiteIdx + 1;
              return (
                <tr
                  key={pair.number}
                  className="border-b border-border/30 last:border-0"
                >
                  <td className="py-1 pr-2 text-right text-xs text-muted">
                    {pair.number}.
                  </td>
                  <td
                    className={cn(
                      "py-1 pr-3",
                      currentMoveIndex === whiteIdx &&
                        "rounded bg-primary/20 font-bold text-primary"
                    )}
                  >
                    {pair.white}
                  </td>
                  <td
                    className={cn(
                      "py-1",
                      pair.black &&
                        currentMoveIndex === blackIdx &&
                        "rounded bg-primary/20 font-bold text-primary"
                    )}
                  >
                    {pair.black ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
