"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";

interface MoveListProps {
  moves: string[];
  fen?: string;
  currentMoveIndex?: number;
  result?: string; // "1-0" | "0-1" | "1/2-1/2" | undefined
  /** Makes each move clickable, e.g. to jump there in a replay. */
  onSelectMove?: (moveIndex: number) => void;
  /** Shown instead of the default when there are no moves. */
  emptyText?: string;
  className?: string;
}

export function MoveList({
  moves,
  fen,
  currentMoveIndex = -1,
  result,
  onSelectMove,
  emptyText = "No moves yet. White has the first move.",
  className,
}: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the selected move; without one, stay at the latest. Only the
  // list's own box scrolls: scrollIntoView would also scroll the page, which
  // on phones yanked the view (and any piece being dragged) every re-render.
  const moveCount = moves.length;
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>("[data-active-move='true']");
    if (!active) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    const box = container.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < box.top) container.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) container.scrollTop += item.bottom - box.bottom;
  }, [moveCount, currentMoveIndex]);

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

  const buildPgn = (): string => {
    let pgn = moves.reduce((acc, move, i) => {
      if (i % 2 === 0) return `${acc} ${Math.floor(i / 2) + 1}. ${move}`;
      return `${acc} ${move}`;
    }, "").trim();
    if (result) pgn += ` ${result}`;
    return pgn;
  };

  const copyPGN = () => {
    void copyText(buildPgn(), "PGN");
  };

  const downloadPGN = () => {
    const pgn = buildPgn();
    const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-${moves.length}-moves.pgn`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PGN downloaded");
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
          {emptyText}
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
          Moves · {moves.length}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={copyPGN}
            className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            title="Copy PGN"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={downloadPGN}
            className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            title="Download PGN"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {fen && (
            <button
              type="button"
              onClick={copyFEN}
              className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
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
                  <MoveCell
                    san={pair.white}
                    index={whiteIdx}
                    active={currentMoveIndex === whiteIdx}
                    onSelectMove={onSelectMove}
                    className="pr-3"
                  />
                  <MoveCell
                    san={pair.black}
                    index={blackIdx}
                    active={Boolean(pair.black) && currentMoveIndex === blackIdx}
                    onSelectMove={onSelectMove}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
        {result && (
          <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-center font-mono text-sm font-bold text-primary">
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

function MoveCell({
  san,
  index,
  active,
  onSelectMove,
  className,
}: {
  san?: string;
  index: number;
  active: boolean;
  onSelectMove?: (moveIndex: number) => void;
  className?: string;
}) {
  return (
    <td className={cn("py-1", className)} data-active-move={active || undefined}>
      {san ? (
        onSelectMove ? (
          <button
            type="button"
            onClick={() => onSelectMove(index)}
            className={cn(
              "w-full rounded px-1 text-left transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary",
              active && "bg-primary/20 font-bold text-primary"
            )}
            aria-current={active ? "step" : undefined}
          >
            {san}
          </button>
        ) : (
          <span className={cn("px-1", active && "rounded bg-primary/20 font-bold text-primary")}>
            {san}
          </span>
        )
      ) : null}
    </td>
  );
}
