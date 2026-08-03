"use client";

import { useState, useCallback, useRef } from "react";
import { Chess, type Square, type Move } from "chess.js";
import { useAtom } from "jotai";
import { matchFenAtom, matchMovesAtom, matchStatusAtom } from "@/store/match";

interface UseChessMatchOptions {
  initialFen?: string;
  onMove?: (move: Move) => void;
}

export function useChessMatch(options: UseChessMatchOptions = {}) {
  const { initialFen = "start", onMove } = options;

  const [fen, setFen] = useAtom(matchFenAtom);
  const [moves, setMoves] = useAtom(matchMovesAtom);
  const [status, setStatus] = useAtom(matchStatusAtom);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const gameRef = useRef(new Chess(initialFen));

  // Initialize from prop
  useState(() => {
    setFen(initialFen);
  });

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      try {
        const game = gameRef.current;
        const move = game.move({ from, to, promotion });
        if (!move) return false;

        const newFen = game.fen();
        setFen(newFen);
        setMoves((prev) => [...prev, move.san]);
        onMove?.(move);

        // Update status
        if (game.isCheckmate()) setStatus("checkmate");
        else if (game.isStalemate()) setStatus("stalemate");
        else if (game.isDraw()) setStatus("draw");

        gameRef.current = game;
        return true;
      } catch {
        return false;
      }
    },
    [setFen, setMoves, setStatus, onMove]
  );

  const loadFen = useCallback(
    (newFen: string) => {
      try {
        const game = new Chess(newFen);
        gameRef.current = game;
        setFen(newFen);
        setMoves([]);
        setStatus("in_progress");
      } catch {
        // Invalid FEN
      }
    },
    [setFen, setMoves, setStatus]
  );

  const game = gameRef.current;

  return {
    fen,
    moves,
    status,
    game,
    turn: game.turn(),
    isGameOver: game.isGameOver(),
    isCheck: game.isCheck(),
    pendingPromotion,
    setPendingPromotion,
    makeMove,
    loadFen,
  };
}
