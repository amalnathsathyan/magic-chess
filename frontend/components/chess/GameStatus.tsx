"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, Flag, Clock, XCircle, Hand, Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string; description: string }
> = {
  checkmate: { icon: CheckCircle, label: "Checkmate!", color: "text-primary", description: "won by checkmate" },
  stalemate: { icon: Hand, label: "Stalemate", color: "text-accent", description: "Game drawn by stalemate" },
  draw: { icon: Hand, label: "Draw", color: "text-muted-foreground", description: "Game drawn by agreement" },
  resign: { icon: Flag, label: "Resigned", color: "text-primary", description: "won by resignation" },
  timeout: { icon: Clock, label: "Time Out", color: "text-primary", description: "won on time" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-muted-foreground", description: "" },
};

export function GameStatus({
  result,
  winner,
  turn,
  className,
}: GameStatusProps) {
  if (result === "in_progress") return null;

  const config = STATUS_CONFIG[result];
  const Icon = config.icon;
  const isDraw = result === "stalemate" || result === "draw";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className={cn(
            "glass-card w-full max-w-md overflow-hidden flex flex-col items-center text-center p-8",
            className
          )}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
            className="mb-6 rounded-full bg-primary/10 p-4"
          >
            {isDraw ? (
              <Hand className="h-12 w-12 text-accent" />
            ) : (
              <Trophy className="h-12 w-12 text-primary" />
            )}
          </motion.div>

          <h2 className={cn("mb-2 font-heading text-3xl font-bold", config.color)}>
            {config.label}
          </h2>
          
          <p className="mb-8 text-muted-foreground">
            {isDraw ? config.description : `${winner === "white" ? "White" : "Black"} ${config.description}`}
          </p>

          <div className="w-full space-y-4 mb-8">
            <div className="rounded-lg bg-secondary/30 p-4 border border-border/50 flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Token Payout</span>
              <span className="font-mono text-lg font-bold text-primary">
                {isDraw ? "10 USDC (Refund)" : "20 USDC"}
              </span>
            </div>
          </div>

          <button className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(0,230,118,0.4)]">
            Claim Winnings
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
