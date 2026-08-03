"use client";

import { cn } from "@/lib/utils";

interface ChessClockProps {
  /** Time remaining in milliseconds */
  whiteTime: number;
  blackTime: number;
  /** Which side's clock is currently running */
  activeSide: "white" | "black" | null;
  /** Whether the clock is paused (e.g., game over) */
  isPaused?: boolean;
  className?: string;
}

/** Format milliseconds as mm:ss */
function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function urgencyClass(ms: number): string {
  if (ms <= 10_000) return "text-destructive animate-pulse [text-shadow:0_0_10px_rgba(239,68,68,0.8)]";
  if (ms <= 60_000) return "text-amber-500 [text-shadow:0_0_10px_rgba(245,158,11,0.5)]";
  return "";
}

export function ChessClock({
  whiteTime,
  blackTime,
  activeSide,
  isPaused = false,
  className,
}: ChessClockProps) {
  return (
    <div className={cn("flex flex-col gap-3 font-mono", className)}>
      {/* Black clock */}
      <div
        className={cn(
          "glass-card flex items-center justify-between px-4 py-3 transition-all",
          activeSide === "black" && !isPaused && "border-primary/30 shadow-glow"
        )}
      >
        <span className="text-xs font-medium text-muted">Black</span>
        <span
          className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            urgencyClass(blackTime)
          )}
        >
          {formatTime(blackTime)}
        </span>
      </div>

      {/* White clock */}
      <div
        className={cn(
          "glass-card flex items-center justify-between px-4 py-3 transition-all",
          activeSide === "white" && !isPaused && "border-primary/30 shadow-glow"
        )}
      >
        <span className="text-xs font-medium text-muted">White</span>
        <span
          className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            urgencyClass(whiteTime)
          )}
        >
          {formatTime(whiteTime)}
        </span>
      </div>
    </div>
  );
}
