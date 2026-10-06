"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [rightClickedSquares, setRightClickedSquares] = useState<
    Record<string, CSSProperties>
  >({});
  const [optionSquares, setOptionSquares] = useState<
    Record<string, CSSProperties>
  >({});
  const [reduceMotion, setReduceMotion] = useState(false);

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const isGameOver = game.isGameOver();

  useEffect(() => {
    setMoveFrom(null);
    setOptionSquares({});
  }, [fen, arePiecesDraggable]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  function getMoveOptions(square: Square) {
    if (!arePiecesDraggable || isGameOver) return false;
    const selectedPiece = game.get(square);
    if (!selectedPiece || selectedPiece.color !== game.turn()) {
      setOptionSquares({});
      return false;
    }
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, CSSProperties> = {};
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as Square) &&
          game.get(move.to as Square)?.color !== game.get(square)?.color
            ? "radial-gradient(circle, transparent 62%, rgba(255,79,26,.55) 63%)"
            : "radial-gradient(circle, rgba(13,14,16,.38) 22%, transparent 23%)",
      };
    });
    newSquares[square] = {
      background: "rgba(255, 79, 26, 0.38)",
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClickInternal(square: Square) {
    if (onSquareClick) {
      onSquareClick(square);
    }
    
    if (!arePiecesDraggable || isGameOver) return;

    setRightClickedSquares({});

    // From square
    if (!moveFrom) {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    // To square
    if (!onPieceDrop) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    const success = onPieceDrop(moveFrom, square);
    
    if (!success) {
      const hasMoveOptions = getMoveOptions(square);
      // If clicked on another piece of same color, change moveFrom
      if (hasMoveOptions) setMoveFrom(square);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    } else {
      setMoveFrom(null);
      setOptionSquares({});
    }
  }

  function onSquareRightClick(square: Square) {
    const colour = "rgba(157, 180, 208, 0.55)";
    setRightClickedSquares((current) => {
      const next = { ...current };
      if (current[square]?.backgroundColor === colour) {
        delete next[square];
      } else {
        next[square] = { backgroundColor: colour };
      }
      return next;
    });
  }

  function onPieceDropInternal(sourceSquare: Square, targetSquare: Square) {
    if (!onPieceDrop || !arePiecesDraggable || isGameOver) return false;
    const success = onPieceDrop(sourceSquare, targetSquare);
    if (success) {
      setMoveFrom(null);
      setOptionSquares({});
    }
    return success;
  }

  // Build check styling
  const checkSquares = useMemo(() => {
    const squares: Record<string, React.CSSProperties> = {};
    if (game.inCheck() || game.isCheckmate()) {
      const turn = game.turn();
      const board = game.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === "k" && piece.color === turn) {
            squares[piece.square] = {
              background: "radial-gradient(circle, rgba(255,79,26,.9) 0%, rgba(255,79,26,.55) 45%, rgba(255,79,26,0) 75%)",
            };
          }
        }
      }
    }
    return squares;
  }, [fen, game]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      // Vermilion marks the consequence: the last move played.
      styles[lastMove.from] = { backgroundColor: "rgba(255, 79, 26, 0.22)" };
      styles[lastMove.to] = { backgroundColor: "rgba(255, 79, 26, 0.38)" };
    }
    if (highlightSquares) {
      for (const [sq, style] of Object.entries(highlightSquares)) {
        styles[sq] = { ...styles[sq], ...style };
      }
    }
    for (const [sq, style] of Object.entries(checkSquares)) {
      styles[sq] = { ...styles[sq], ...style };
    }
    for (const [sq, style] of Object.entries(optionSquares)) {
      styles[sq] = { ...styles[sq], ...style };
    }
    for (const [sq, style] of Object.entries(rightClickedSquares)) {
      styles[sq] = { ...styles[sq], ...style };
    }
    return styles;
  }, [lastMove, highlightSquares, checkSquares, optionSquares, rightClickedSquares]);

  const arrows = useMemo(() => {
    if (!customArrows || customArrows.length === 0) return undefined;
    return customArrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? "rgba(255, 79, 26, 0.8)" }));
  }, [customArrows]);

  return (
    <div
      className={cn("mx-auto w-fit", className)}
      role="application"
      aria-label={
        arePiecesDraggable
          ? "Interactive chess board. Select or drag a piece to make a legal move."
          : "Read-only chess board"
      }
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: arePiecesDraggable && !isGameOver,
          animationDurationInMs: reduceMotion ? 0 : 150,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onPieceDropInternal(sourceSquare as Square, targetSquare as Square);
          },
          onSquareClick: ({ square }) => onSquareClickInternal(square as Square),
          onSquareRightClick: ({ square }) => onSquareRightClick(square as Square),
          boardStyle: {
            width: boardWidth,
            height: boardWidth,
            borderRadius: 0,
            boxShadow: "0 0 0 1px #2C3036",
          },
          // Graphite and bone, per the ZUG board spec.
          darkSquareStyle: { backgroundColor: "#5F656E" },
          lightSquareStyle: { backgroundColor: "#E4DFD4" },
          darkSquareNotationStyle: { color: "#E4DFD4", fontFamily: "var(--font-jetbrains)", fontSize: "10px" },
          lightSquareNotationStyle: { color: "#5F656E", fontFamily: "var(--font-jetbrains)", fontSize: "10px" },
          squareStyles,
          arrows,
        }}
      />
    </div>
  );
}
