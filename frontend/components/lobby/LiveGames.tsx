"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Radio, Sparkles } from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { api, type ApiMatch } from "@/lib/api";
import { shortenAddress } from "@/lib/chess";
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
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading live games">
        {[0, 1].map((key) => (
          <div key={key} className="h-36 animate-pulse rounded-xl border border-border bg-card/60" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="glass-card flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
        No games in progress right now. Start one — spectators can watch and predict your moves.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((game) => (
        <Link
          key={game.matchId}
          href={spectateHref(game.matchId)}
          className="group glass-card flex gap-3 p-3 transition-all hover:border-border-hover hover:shadow-glow focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="pointer-events-none shrink-0 overflow-hidden rounded-md" aria-hidden="true">
            {game.boardFen ? (
              <ChessBoard fen={game.boardFen} boardWidth={112} arePiecesDraggable={false} />
            ) : (
              <div className="h-28 w-28 rounded-md bg-card" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
            <div>
              <span className="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                LIVE · move {Math.ceil((game.moveCount + 1) / 2)}
              </span>
              <p className="mt-2 truncate font-mono text-xs">
                ♔ {shortenAddress(game.whitePlayer)}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                ♚ {game.blackPlayer ? shortenAddress(game.blackPlayer) : "—"}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-accent/90">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {game.openPredictions ?? 0} predictions
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:underline">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Watch &amp; predict
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
