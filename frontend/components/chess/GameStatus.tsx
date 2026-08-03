"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, Flag, Clock, XCircle, Hand } from "lucide-react";

type GameResult =
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resign"
  | "timeout"
  | "in_progress";

interface GameStatusProps {
  result: GameResult;
  winner?: "white" | "black" | null;
  turn: "white" | "black";
  className?: string;
}

const STATUS_CONFIG: Record<
  GameResult,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  checkmate: { icon: CheckCircle, label: "Checkmate", color: "text-primary" },
  stalemate: { icon: Hand, label: "Stalemate", color: "text-accent" },
  draw: { icon: Hand, label: "Draw", color: "text-muted-foreground" },
  resign: { icon: Flag, label: "Resigned", color: "text-destructive" },
  timeout: { icon: Clock, label: "Time Out", color: "text-destructive" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-muted-foreground" },
};

export function GameStatus({
  result,
  winner,
  turn,
  className,
}: GameStatusProps) {
  const config = STATUS_CONFIG[result];
  const Icon = config.icon;
  const isOver = result !== "in_progress";

  return (
    <div
      className={cn(
        "glass-card flex items-center gap-3 px-4 py-3",
        className
      )}
    >
      <Icon className={cn("h-5 w-5", config.color)} />
      <div>
        <p className={cn("font-heading text-sm font-semibold", config.color)}>
          {config.label}
        </p>
        {isOver && winner ? (
          <p className="text-xs text-muted-foreground">
            {winner === "white" ? "White" : "Black"} wins
          </p>
        ) : !isOver ? (
          <p className="text-xs text-muted-foreground">
            {turn === "white" ? "White" : "Black"} to move
          </p>
        ) : null}
      </div>
    </div>
  );
}
