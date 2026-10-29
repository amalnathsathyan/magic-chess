"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { FinishedGameCard } from "@/components/lobby/FinishedGameCard";
import { api, type ApiMatch } from "@/lib/api";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;
const PAGE_SIZE = 10;

type Scope = "all" | "mine";

/**
 * Finished games anyone can open and replay. "All players" is the shared
 * history of the arena; "Your games" narrows it to the signed-in wallet.
 */
export function RecentGames({ walletAddress }: { walletAddress?: string | null }) {
  const [scope, setScope] = useState<Scope>("all");
  const [games, setGames] = useState<ApiMatch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [failed, setFailed] = useState(false);

  // Signing out drops the personal view.
  useEffect(() => {
    if (!walletAddress && scope === "mine") setScope("all");
  }, [scope, walletAddress]);

  const load = useCallback(async () => {
    try {
      const { matches, pagination } = await api.listMatches({
        status: "Completed",
        limit,
        ...(scope === "mine" && walletAddress ? { player: walletAddress } : {}),
      });
      setGames(matches);
      setTotal(pagination.total);
      setFailed(false);
    } catch {
      setGames((current) => current ?? []);
      setFailed(true);
    }
  }, [limit, scope, walletAddress]);

  useEffect(() => {
    setGames(null);
  }, [scope]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section className="panel" aria-labelledby="recent-games-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="recent-games-heading" className="section-title">
          Recent games
        </h2>
        {walletAddress ? (
          <div className="flex gap-1">
            <ScopeTab active={scope === "all"} onClick={() => setScope("all")}>
              Everyone
            </ScopeTab>
            <ScopeTab active={scope === "mine"} onClick={() => setScope("mine")}>
              Yours
            </ScopeTab>
          </div>
        ) : null}
      </div>

      {games === null ? (
        <div className="divide-y divide-border" aria-label="Loading recent games">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[60px] animate-pulse bg-card-hover/40" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Trophy className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {failed
              ? "Game history is catching up."
              : scope === "mine"
                ? "You haven't finished a game yet."
                : "No finished games yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {games.map((game) => (
              <FinishedGameCard key={game.matchId} match={game} viewer={walletAddress} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            {games.length < total ? (
              <button
                type="button"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Show {Math.min(PAGE_SIZE, total - games.length)} more
              </button>
            ) : (
              <span />
            )}
            <Link href="/leaderboard" className="text-sm font-medium text-primary hover:underline">
              Ladder
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-8 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-card-hover text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
