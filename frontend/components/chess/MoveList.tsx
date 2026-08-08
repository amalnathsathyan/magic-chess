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

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`, {
        description: "Your browser blocked clipboard access.",
      });
    }
  };

  const copyPGN = () => {
    const pgn = moves.reduce((acc, move, i) => {
      if (i % 2 === 0) return `${acc} ${Math.floor(i / 2) + 1}. ${move}`;
      return `${acc} ${move}`;
    }, "").trim();
    void copyText(pgn, "PGN");
  };

  const copyFEN = () => {
    if (fen) {
      void copyText(fen, "FEN");
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
          "glass-card flex h-full flex-col bg-background/40 p-4 backdrop-blur-md",
          className
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Moves
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No moves yet. White has the first move.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "glass-card flex h-full flex-col bg-background/40 p-4 backdrop-blur-md",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Moves
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyPGN}
            className="flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            title="Copy PGN"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> PGN
          </button>
          {fen && (
            <button
              type="button"
              onClick={copyFEN}
              className="flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              title="Copy FEN"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> FEN
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
                  <td className="py-1 pr-2 text-right text-xs text-muted-foreground">
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
