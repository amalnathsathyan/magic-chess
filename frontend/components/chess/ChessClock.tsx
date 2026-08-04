"use client";

import { cn } from "@/lib/utils";

interface ChessClockProps {
  time: number;
  isActive: boolean;
  className?: string;
}

function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ChessClock({ time, isActive, className }: ChessClockProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full px-3 py-1 font-mono text-sm font-bold transition-all",
        isActive ? "bg-green-600 text-white shadow-sm" : "bg-muted text-muted-foreground",
        time <= 10000 && isActive && "bg-red-500 animate-pulse",
        className
      )}
    >
      {formatTime(time)}
    </div>
  );
}
