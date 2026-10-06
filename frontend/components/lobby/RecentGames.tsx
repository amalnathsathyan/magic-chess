"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History, Trophy } from "lucide-react";
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
    <section className="mt-10" aria-labelledby="recent-games-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="recent-games-heading"
          className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Recent games
        </h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <ScopeTab active={scope === "all"} onClick={() => setScope("all")}>
            All players
          </ScopeTab>
          {walletAddress ? (
            <ScopeTab active={scope === "mine"} onClick={() => setScope("mine")}>
              Your games
            </ScopeTab>
          ) : null}
        </div>
      </div>

      {games === null ? (
        <div className="grid gap-3" aria-label="Loading recent games">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-xl border border-border bg-card/60" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Trophy className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">
            {failed
              ? "Game history is catching up."
              : scope === "mine"
                ? "You haven't finished a game yet."
                : "No finished games yet."}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Every game that ends shows up here for anyone to replay move by move.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {games.map((game) => (
              <FinishedGameCard key={game.matchId} match={game} viewer={walletAddress} />
            ))}
          </div>
          {games.length < total ? (
            <button
              type="button"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              Show more games ({total - games.length} more)
            </button>
          ) : null}
          <Link
            href="/leaderboard"
            className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
          >
            See the rating leaderboard
          </Link>
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
        "min-h-9 rounded-md px-3 text-xs font-semibold transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
