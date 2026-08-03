"use client";

import { useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { cn } from "@/lib/utils";

type BoardOrientation = "white" | "black";

interface ChessBoardProps {
  fen: string;
  orientation?: BoardOrientation;
  boardWidth?: number;
  arePiecesDraggable?: boolean;
  onPieceDrop?: (sourceSquare: Square, targetSquare: Square) => boolean;
  onSquareClick?: (square: Square) => void;
  customArrows?: { from: Square; to: Square; color?: string }[];
  highlightSquares?: Record<string, { backgroundColor: string }>;
  lastMove?: { from: Square; to: Square } | null;
  className?: string;
}

export function ChessBoard({
  fen = "start",
  orientation = "white",
  boardWidth = 560,
  arePiecesDraggable = true,
  onPieceDrop,
  onSquareClick,
  customArrows,
  highlightSquares,
  lastMove,
  className,
}: ChessBoardProps) {
  const game = useMemo(() => {
    try {
      const chess = new Chess(fen);
      return chess;
    } catch {
      return new Chess();
    }
  }, [fen]);

  const isGameOver = game.isGameOver();

  // Build move highlight squares from lastMove
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(0, 230, 118, 0.3)" };
      styles[lastMove.to] = { backgroundColor: "rgba(0, 230, 118, 0.3)" };
    }
    if (highlightSquares) {
      for (const [sq, style] of Object.entries(highlightSquares)) {
        styles[sq] = { ...styles[sq], ...style };
      }
    }
    return styles;
  }, [lastMove, highlightSquares]);

  // Build arrows from customArrows
  const arrows = useMemo(() => {
    if (!customArrows || customArrows.length === 0) return undefined;
    return customArrows.map((a) => [a.from, a.to, a.color ?? "rgb(0, 230, 118)"] as [string, string, string]);
  }, [customArrows]);

  return (
    <div className={cn("mx-auto w-fit", className)}>
      <Chessboard
        options={{
          id: "magic-chess-board",
          position: fen,
          boardOrientation: orientation,
          allowDragging: arePiecesDraggable && !isGameOver,
          animationDurationInMs: 200,
          onPieceDrop: onPieceDrop
            ? (args) => {
                if (args?.sourceSquare && args?.targetSquare) {
                  return onPieceDrop(
                    args.sourceSquare as Square,
                    args.targetSquare as Square
                  );
                }
                return false;
              }
            : undefined,
          onSquareClick: onSquareClick
            ? (args) => {
                if (args?.square) onSquareClick(args.square as Square);
              }
            : undefined,
          boardStyle: {
            borderRadius: "0.75rem",
            boxShadow: "0 0 20px rgba(0, 230, 118, 0.15)",
          },
          darkSquareStyle: { backgroundColor: "#1a1a2e" },
          lightSquareStyle: { backgroundColor: "#16213e" },
          squareStyles,
          arrows: arrows as never,
        }}
      />
    </div>
  );
}
