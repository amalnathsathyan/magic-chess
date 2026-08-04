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

  const isCheckmate = result === "checkmate";
  const isDraw = result === "stalemate" || result === "draw";
  const heading = isCheckmate ? (winner === "white" ? "White wins!" : "Black wins!") : (isDraw ? "Draw" : "Game Over");
  const subHeading = isCheckmate ? "by checkmate" : result;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.3 }}
          className={cn(
            "bg-white w-full max-w-sm rounded-2xl overflow-hidden flex flex-col items-center text-center p-8 shadow-2xl",
            className
          )}
        >
          <div className="mb-4 text-gray-900">
            {isDraw ? (
              <Hand className="h-10 w-10 mx-auto opacity-80" />
            ) : (
              <Trophy className="h-10 w-10 mx-auto text-yellow-500" />
            )}
          </div>

          <h2 className="mb-1 text-2xl font-bold text-gray-900">
            {heading}
          </h2>
          
          <p className="mb-8 text-sm text-gray-500 capitalize">
            {subHeading}
          </p>

          <div className="flex gap-3 w-full">
            <button className="flex-1 rounded-full bg-gray-100 hover:bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors">
              Share
            </button>
            <button className="flex-1 rounded-full bg-green-600 hover:bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
              Play more
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
