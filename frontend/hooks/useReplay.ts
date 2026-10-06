"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Square } from "chess.js";
import type { ApiMove } from "@/lib/api";
import { isSquare } from "@/lib/match-board";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];

export interface ReplayState {
  /** 0 = starting position, n = after the nth half-move. */
  ply: number;
  totalPlies: number;
  fen: string;
  lastMove: { from: Square; to: Square } | null;
  atStart: boolean;
  atEnd: boolean;
  playing: boolean;
  speed: ReplaySpeed;
  speeds: readonly ReplaySpeed[];
  goTo: (ply: number) => void;
  step: (delta: number) => void;
  toStart: () => void;
  toEnd: () => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
}

/**
 * Walks a finished game ply by ply. Every position comes from the move the
 * indexer recorded, so no chess engine has to re-derive the game.
 */
export function useReplay(moves: ApiMove[], options?: { autoPlay?: boolean }): ReplayState {
  const positions = useMemo(
    () => [INITIAL_FEN, ...moves.map((move) => move.fenAfter)],
    [moves]
  );
  const totalPlies = positions.length - 1;
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(Boolean(options?.autoPlay));
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  // Keep the viewer where they are while more of the game arrives.
  const lastTotal = useRef(totalPlies);

  useEffect(() => {
    if (totalPlies < lastTotal.current) setPly(0);
    lastTotal.current = totalPlies;
  }, [totalPlies]);

  const goTo = useCallback(
    (next: number) => setPly(Math.min(Math.max(next, 0), Math.max(totalPlies, 0))),
    [totalPlies]
  );
  const step = useCallback((delta: number) => setPly((current) => current + delta), []);

  // Clamp whenever the game or the position changes.
  useEffect(() => {
    setPly((current) => Math.min(Math.max(current, 0), Math.max(totalPlies, 0)));
  }, [totalPlies]);

  useEffect(() => {
    if (!playing) return;
    if (ply >= totalPlies) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setPly((current) => current + 1), 1_100 / speed);
    return () => window.clearTimeout(id);
  }, [playing, ply, speed, totalPlies]);

  const togglePlay = useCallback(() => {
    setPlaying((current) => {
      if (current) return false;
      // Replaying from the end starts over.
      setPly((at) => (at >= totalPlies ? 0 : at));
      return totalPlies > 0;
    });
  }, [totalPlies]);

  const move = ply > 0 ? moves[ply - 1] : undefined;
  const lastMove =
    move && isSquare(move.from) && isSquare(move.to)
      ? { from: move.from as Square, to: move.to as Square }
      : null;

  return {
    ply,
    totalPlies,
    fen: positions[Math.min(ply, positions.length - 1)] ?? INITIAL_FEN,
    lastMove,
    atStart: ply === 0,
    atEnd: ply >= totalPlies,
    playing,
    speed,
    speeds: SPEEDS,
    goTo,
    step,
    toStart: useCallback(() => setPly(0), []),
    toEnd: useCallback(() => setPly(totalPlies), [totalPlies]),
    togglePlay,
    setSpeed,
  };
}

/** ←/→ step, ↑/↓ jump to the ends, space plays or pauses. */
export function useReplayKeyboard(replay: ReplayState): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      switch (event.key) {
        case "ArrowLeft":
          replay.step(-1);
          break;
        case "ArrowRight":
          replay.step(1);
          break;
        case "ArrowUp":
        case "Home":
          replay.toStart();
          break;
        case "ArrowDown":
        case "End":
          replay.toEnd();
          break;
        case " ":
          replay.togglePlay();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replay]);
}
