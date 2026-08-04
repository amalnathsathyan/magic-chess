"use client";

import { useState, useMemo, useEffect } from "react";
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
  const [rightClickedSquares, setRightClickedSquares] = useState<any>({});
  const [optionSquares, setOptionSquares] = useState<any>({});

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const isGameOver = game.isGameOver();

  function getMoveOptions(square: Square) {
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as Square) &&
          game.get(move.to as Square)?.color !== game.get(square)?.color
            ? "radial-gradient(circle, rgba(255,255,255,.25) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(255,255,255,.25) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });
    newSquares[square] = {
      background: "rgba(255, 255, 255, 0.15)",
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClickInternal(square: Square) {
    if (onSquareClick) {
      onSquareClick(square);
    }
    
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
    const colour = "rgba(255, 255, 255, 0.2)";
    setRightClickedSquares({
      ...rightClickedSquares,
      [square]:
        rightClickedSquares[square] &&
        rightClickedSquares[square].backgroundColor === colour
          ? undefined
          : { backgroundColor: colour },
    });
  }

  function onPieceDropInternal(sourceSquare: Square, targetSquare: Square) {
    if (!onPieceDrop) return false;
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
          if (piece && piece.type === 'k' && piece.color === turn) {
            squares[piece.square] = { backgroundColor: "rgba(255, 0, 0, 0.5)" };
          }
        }
      }
    }
    return squares;
  }, [fen, game]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(255, 255, 255, 0.15)" };
      styles[lastMove.to] = { backgroundColor: "rgba(255, 255, 255, 0.15)" };
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
      if (style && typeof style === 'object') {
        styles[sq] = { ...styles[sq], ...(style as any) };
      }
    }
    for (const [sq, style] of Object.entries(rightClickedSquares)) {
      if (style && typeof style === 'object') {
        styles[sq] = { ...styles[sq], ...(style as any) };
      }
    }
    return styles;
  }, [lastMove, highlightSquares, checkSquares, optionSquares, rightClickedSquares]);

  const arrows = useMemo(() => {
    if (!customArrows || customArrows.length === 0) return undefined;
    return customArrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? "rgba(255, 255, 255, 0.5)" }));
  }, [customArrows]);

  return (
    <div className={cn("mx-auto w-fit", className)}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: arePiecesDraggable && !isGameOver,
          animationDurationInMs: 200,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onPieceDropInternal(sourceSquare as Square, targetSquare as Square);
          },
          onSquareClick: ({ square }) => onSquareClickInternal(square as Square),
          onSquareRightClick: ({ square }) => onSquareRightClick(square as Square),
          boardStyle: {
            width: boardWidth,
            height: boardWidth,
            borderRadius: "4px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)",
          },
          darkSquareStyle: { backgroundColor: "#1e1e1e" }, // dark charcoal
          lightSquareStyle: { backgroundColor: "#404040" }, // dark gray
          squareStyles,
          arrows: arrows as any,
        }}
      />
    </div>
  );
}
