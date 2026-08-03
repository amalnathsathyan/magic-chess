"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { ChessClock } from "@/components/chess/ChessClock";
import { MoveList } from "@/components/chess/MoveList";
import { CapturedPieces } from "@/components/chess/CapturedPieces";
import { GameStatus } from "@/components/chess/GameStatus";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { TransactionStatus } from "@/components/shared/TransactionStatus";
import type { Square } from "chess.js";
import { Chess } from "chess.js";

interface PlayPageProps {
  params: Promise<{ matchId: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  const router = useRouter();
  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [moves, setMoves] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [promotionSquare, setPromotionSquare] = useState<Square | null>(null);

  // Clock state (mock — 5 minutes each)
  const [whiteTime] = useState(300_000);
  const [blackTime] = useState(300_000);
  const [activeSide] = useState<"white" | "black" | null>("white");

  // Tx status (mock)
  const [txStatus] = useState<"idle" | "submitting" | "confirming" | "success" | "error">("idle");

  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      try {
        const game = new Chess(fen);

        // Check for promotion
        const piece = game.get(sourceSquare as never);
        if (
          piece &&
          piece.type === "p" &&
          ((piece.color === "w" && targetSquare[1] === "8") ||
            (piece.color === "b" && targetSquare[1] === "1"))
        ) {
          setPromotionSquare(targetSquare);
          return false;
        }

        const move = game.move({
          from: sourceSquare,
          to: targetSquare,
        });

        if (move) {
          setFen(game.fen());
          setMoves((prev) => [...prev, move.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: sourceSquare, to: targetSquare });
          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [fen]
  );

  const handlePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n") => {
      if (!promotionSquare) return;

      try {
        const game = new Chess(fen);
        // Find the pawn move that needs promotion
        const moves = game.moves({ verbose: true });
        const promoMove = moves.find(
          (m) => m.to === promotionSquare && m.promotion
        );

        if (promoMove) {
          game.move({ from: promoMove.from as Square, to: promotionSquare, promotion: piece });
          setFen(game.fen());
          setMoves((prev) => [...prev, promoMove.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: promoMove.from as Square, to: promotionSquare });
        }
      } catch {
        // Invalid move
      }

      setPromotionSquare(null);
    },
    [fen, promotionSquare]
  );

  // Determine game result
  const game = new Chess(fen);
  const isGameOver = game.isGameOver();
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
              onClick={() => router.push("/arena")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Arena
            </button>
            <span className="hidden text-sm text-muted sm:inline">|</span>
            <span className="hidden font-mono text-xs text-muted sm:inline">
              Match ID
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/play/match123/spectate`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              Spectate
            </Link>
            <TransactionStatus status={txStatus} />
          </div>
        </div>
      </header>

      {/* Game layout */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          {/* Left column: board */}
          <div className="flex flex-col items-center gap-4">
            {/* Black clock + captured pieces */}
            <div className="flex w-full max-w-[560px] items-start justify-between">
              <CapturedPieces
                whiteCaptured={[]}
                blackCaptured={[]}
                side="white"
              />
              <ChessClock
                whiteTime={whiteTime}
                blackTime={blackTime}
                activeSide={activeSide}
                isPaused={isGameOver}
              />
            </div>

            {/* Chess board */}
            <div className="relative">
              <ChessBoard
                fen={fen}
                orientation="white"
                boardWidth={560}
                onPieceDrop={handlePieceDrop}
                lastMove={lastMove}
              />
              {promotionSquare && (
                <PromotionDialog
                  isOpen={!!promotionSquare}
                  color={turn === "w" ? "white" : "black"}
                  onSelect={handlePromotion}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />
              )}
            </div>

            {/* White captured pieces */}
            <div className="flex w-full max-w-[560px] justify-start">
              <CapturedPieces
                whiteCaptured={[]}
                blackCaptured={[]}
                side="black"
              />
            </div>
          </div>

          {/* Right column: move list + status */}
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
