"use client";

import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";

export interface LoggedMove {
  san: string;
  from: Square;
  to: Square;
}

const STORAGE_PREFIX = "magic-chess:moves:";

/** Piece placement and side to move: the part of a FEN both engines agree on. */
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 2).join(" ");
}

/** Replay a move list from the start; null when it isn't a legal game. */
function replay(moves: LoggedMove[]): Chess | null {
  const chess = new Chess();
  try {
    for (const move of moves) chess.move(move.san);
    return chess;
  } catch {
    return null;
  }
}

// Final position per list, so the list isn't replayed on every render.
const replayedFen = new WeakMap<LoggedMove[], string | null>();

function finalFen(moves: LoggedMove[]): string | null {
  if (!replayedFen.has(moves)) replayedFen.set(moves, replay(moves)?.fen() ?? null);
  return replayedFen.get(moves) ?? null;
}

/** The legal moves (one or two plies) that turn `chess` into `targetFen`. */
function bridge(chess: Chess, targetFen: string): LoggedMove[] | null {
  const target = positionKey(targetFen);
  for (const first of chess.moves({ verbose: true })) {
    const afterFirst = new Chess(first.after);
    if (positionKey(first.after) === target) {
      return [{ san: first.san, from: first.from, to: first.to }];
    }
    for (const second of afterFirst.moves({ verbose: true })) {
      if (positionKey(second.after) === target) {
        return [
          { san: first.san, from: first.from, to: first.to },
          { san: second.san, from: second.from, to: second.to },
        ];
      }
    }
  }
  return null;
}

function load(matchId: string): LoggedMove[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + matchId);
    const parsed = raw ? (JSON.parse(raw) as LoggedMove[]) : [];
    return Array.isArray(parsed) && replay(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(matchId: string, moves: LoggedMove[]) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(moves));
  } catch {
    // Storage is a convenience; the list still works for this tab.
  }
}

/**
 * The Moves list, kept in step with the live board.
 *
 * Every position the board streams in is linked to the previous one by the
 * legal move between them, so the list grows the instant a move lands, with
 * no database or transaction lookups. Lists from the indexer database or the
 * rollup's transaction log take over whenever they are longer (for example
 * after joining a game midway), and the list is kept per match in this
 * browser so a reload doesn't empty it.
 */
export function useMoveLog(input: {
  matchId: string;
  /** Authoritative on-chain position (not an optimistic one). */
  fen: string | null;
  /** Move lists from other sources, e.g. the database and the rollup log. */
  sources: (LoggedMove[] | null | undefined)[];
}): LoggedMove[] {
  const { matchId, fen, sources } = input;
  const [log, setLog] = useState<{ matchId: string; moves: LoggedMove[] }>({
    matchId: "",
    moves: [],
  });

  useEffect(() => {
    if (matchId) setLog({ matchId, moves: load(matchId) });
  }, [matchId]);

  // Board/list pairs already known not to link, so a gap isn't re-searched
  // on every render.
  const unlinked = useRef<string | null>(null);
  const longestSource = sources.reduce<LoggedMove[]>(
    (best, list) => (list && list.length > best.length ? list : best),
    []
  );

  useEffect(() => {
    if (!matchId || log.matchId !== matchId) return;
    let moves = log.moves;

    // Another source knows more of the game: adopt it.
    if (longestSource.length > moves.length && finalFen(longestSource)) {
      moves = longestSource;
    }

    // Link the live board to the end of the list.
    if (fen) {
      const listFen = finalFen(moves);
      const attempt = `${moves.length}|${fen}`;
      if (
        listFen &&
        positionKey(listFen) !== positionKey(fen) &&
        unlinked.current !== attempt
      ) {
        const step = bridge(new Chess(listFen), fen);
        if (step) moves = [...moves, ...step];
        else unlinked.current = attempt;
      }
    }

    if (moves !== log.moves) {
      setLog({ matchId, moves });
      save(matchId, moves);
    }
  }, [fen, log, longestSource, matchId]);

  return log.matchId === matchId ? log.moves : [];
}
