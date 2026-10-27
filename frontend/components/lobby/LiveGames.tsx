"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Radio, Sparkles } from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { api, type ApiMatch } from "@/lib/api";
import { playerLabel } from "@/lib/players";
import { spectateHref } from "@/lib/match-links";

const REFRESH_MS = 10_000;

/** Games in progress right now, from the backend chain indexer. */
export function LiveGames({ excludePlayer }: { excludePlayer?: string | null }) {
  const [games, setGames] = useState<ApiMatch[] | null>(null);

  const load = useCallback(async () => {
    try {
      // Games whose clock ran out wait for a timeout claim; they aren't live.
      const { matches } = await api.listMatches({ status: "Active", timedOut: false, limit: 12 });
      setGames(matches);
    } catch {
      setGames((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const visible = (games ?? []).filter(
    (game) => !excludePlayer || (game.whitePlayer !== excludePlayer && game.blackPlayer !== excludePlayer)
  );

  if (games === null) {
    return (
      <div className="divide-y divide-border" aria-label="Loading live games">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex gap-3 p-3">
            <div className="h-[72px] w-[72px] animate-pulse bg-card-hover" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-3 w-2/3 animate-pulse bg-card-hover" />
              <div className="h-3 w-1/2 animate-pulse bg-card-hover" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
        No games in progress.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {visible.map((game) => (
        <li key={game.matchId}>
          <Link
            href={spectateHref(game.matchId)}
            className="row-link group flex items-center gap-3 p-3"
          >
            <div className="pointer-events-none shrink-0 overflow-hidden" aria-hidden="true">
              {game.boardFen ? (
                <ChessBoard fen={game.boardFen} boardWidth={72} arePiecesDraggable={false} showCoordinates={false} />
              ) : (
                <div className="h-[72px] w-[72px] bg-card-hover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {playerLabel(game.whitePlayer, game.whiteName)}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {game.blackPlayer ? playerLabel(game.blackPlayer, game.blackName) : "—"}
              </p>
              <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground tnum">
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Move {Math.ceil((game.moveCount + 1) / 2)}
                </span>
                {game.openPredictions ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {game.openPredictions}
                  </span>
                ) : null}
              </p>
            </div>
            <Eye className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-label="Watch" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
