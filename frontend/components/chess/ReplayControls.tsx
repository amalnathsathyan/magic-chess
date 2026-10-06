"use client";

import {
  ChevronLeft,
  ChevronRight,
  FlipVertical,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { ReplayState } from "@/hooks/useReplay";
import { cn } from "@/lib/utils";

const buttonClass =
  "inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

export function ReplayControls({
  replay,
  onFlip,
  className,
}: {
  replay: ReplayState;
  onFlip?: () => void;
  className?: string;
}) {
  const { ply, totalPlies, playing } = replay;
  const moveNumber = ply === 0 ? 0 : Math.ceil(ply / 2);

  return (
    <div className={cn("glass-card w-full max-w-[560px] p-2", className)}>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={replay.toStart}
          disabled={replay.atStart}
          className={buttonClass}
          aria-label="Jump to the starting position"
        >
          <SkipBack className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => replay.step(-1)}
          disabled={replay.atStart}
          className={buttonClass}
          aria-label="Previous move"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={replay.togglePlay}
          disabled={totalPlies === 0}
          className={cn(buttonClass, "bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary")}
          aria-label={playing ? "Pause replay" : "Play the game through"}
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => replay.step(1)}
          disabled={replay.atEnd}
          className={buttonClass}
          aria-label="Next move"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={replay.toEnd}
          disabled={replay.atEnd}
          className={buttonClass}
          aria-label="Jump to the final position"
        >
          <SkipForward className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="ml-1 shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:ml-2">
          {ply === 0 ? "Start" : `${moveNumber}${ply % 2 === 1 ? "." : "…"}`} · {ply}/{totalPlies}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="replay-speed">
            Replay speed
          </label>
          <select
            id="replay-speed"
            value={replay.speed}
            onChange={(event) => replay.setSpeed(Number(event.target.value) as typeof replay.speed)}
            className="min-h-10 rounded-md border border-border bg-card px-2 font-mono text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            {replay.speeds.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
          {onFlip ? (
            <button type="button" onClick={onFlip} className={buttonClass} aria-label="Flip board">
              <FlipVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <label className="sr-only" htmlFor="replay-position">
        Move position
      </label>
      <input
        id="replay-position"
        type="range"
        min={0}
        max={Math.max(totalPlies, 0)}
        value={ply}
        onChange={(event) => replay.goTo(Number(event.target.value))}
        disabled={totalPlies === 0}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary disabled:opacity-40"
      />
      <p className="mt-1 hidden text-center text-[11px] text-muted-foreground sm:block">
        Arrow keys step through the game, space plays it.
      </p>
    </div>
  );
}
