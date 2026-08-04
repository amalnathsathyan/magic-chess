"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Users } from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { GameStatus } from "@/components/chess/GameStatus";
import { ChessClock } from "@/components/chess/ChessClock";
import type { Square } from "chess.js";
import { Chess } from "chess.js";

interface SpectatePageProps {
  params: Promise<{ matchId: string }>;
}

export default function SpectatePage({ params }: SpectatePageProps) {
  const router = useRouter();
  const [fen, setFen] = useState(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  );
  const [moves, setMoves] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  // Mock clock
  const [whiteTime] = useState(300_000);
  const [blackTime] = useState(300_000);
  const [activeSide] = useState<"white" | "black" | null>(null);

  const game = new Chess(fen);
  const turn = game.turn();

  let result: "in_progress" | "checkmate" | "stalemate" | "draw" = "in_progress";
  let winner: "white" | "black" | null = null;

  if (game.isCheckmate()) {
    result = "checkmate";
    winner = turn === "w" ? "black" : "white";
  } else if (game.isStalemate()) {
    result = "stalemate";
  } else if (game.isDraw()) {
    result = "draw";
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <span className="hidden text-sm text-muted sm:inline">|</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Eye className="h-4 w-4" />
              Spectating
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>3 watching</span>
          </div>
        </div>
      </header>

      {/* Spectator layout */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          {/* Left: board + clocks */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex w-full max-w-[560px] justify-between items-center mb-2">
              <span className="text-sm font-semibold">Black</span>
              <ChessClock time={blackTime} isActive={activeSide === "black"} />
            </div>

            <ChessBoard
              fen={fen}
              orientation="white"
              boardWidth={560}
              arePiecesDraggable={false}
              lastMove={lastMove}
            />

            <div className="flex w-full max-w-[560px] justify-between items-center mt-2">
              <span className="text-sm font-semibold">White</span>
              <ChessClock time={whiteTime} isActive={activeSide === "white"} />
            </div>

            <p className="text-xs text-muted">
              You are in spectator mode. Moves are read-only.
            </p>
          </div>

          {/* Right: status + move list */}
          <div className="flex flex-col gap-4">
            <GameStatus
              result={result}
              winner={winner}
              turn={turn === "w" ? "white" : "black"}
            />

            <MoveList
              moves={moves}
              currentMoveIndex={currentMoveIndex}
              className="flex-1"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
