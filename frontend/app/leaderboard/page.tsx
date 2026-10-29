"use client";

import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { api, type ApiLeaderboardEntry } from "@/lib/api";
import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { profileHref } from "@/lib/match-links";
import { playerLabel } from "@/lib/players";
import { predictionsApi } from "@/lib/predictions";

type Predictor = Awaited<ReturnType<typeof predictionsApi.leaderboard>>["leaderboard"][number];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<ApiLeaderboardEntry[]>([]);
  const [sortBy, setSortBy] = useState<"rating" | "xp" | "wins" | "winRate" | "totalGames">("rating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [predictors, setPredictors] = useState<Predictor[] | null>(null);

  useEffect(() => {
    predictionsApi
      .leaderboard()
      .then((data) => setPredictors(data.leaderboard))
      .catch(() => setPredictors([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getLeaderboard({ sortBy, limit: 50 })
      .then((data) => setEntries(data.leaderboard))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [sortBy]);

  const rankIcon = (rank: number) => (
    <span
      className={`inline-block w-6 text-sm tnum ${
        rank <= 3 ? "font-bold text-primary" : "text-muted-foreground"
      }`}
    >
      {rank}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      <h1 className="font-display text-5xl sm:text-6xl">Ladder</h1>
      <p className="mt-3 text-muted-foreground">Everyone starts at 1200. Every finished game earns XP.</p>

      {/* Sort controls */}
      <div className="mt-8 flex flex-wrap gap-1" role="group" aria-label="Sort by">
        {(["rating", "xp", "wins", "winRate", "totalGames"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            aria-pressed={sortBy === s}
            className={`min-h-9 border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              sortBy === s
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
            }`}
          >
            {s === "rating"
              ? "Rating"
              : s === "xp"
                ? "XP"
                : s === "wins"
                ? "Wins"
                : s === "winRate"
                  ? "Win rate"
                  : "Games"}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="panel mt-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="flex justify-center py-12 text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Trophy className="mb-3 h-6 w-6" aria-hidden="true" />
            <p className="text-sm">No players yet. Finish a game to appear here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-3 pl-4 pr-2">#</th>
                <th className="py-3 px-2">Player</th>
                <th className="py-3 px-2 text-right">Rating</th>
                <th className="py-3 px-2 text-right">Level</th>
                <th className="hidden py-3 px-2 text-right sm:table-cell">Games</th>
                <th className="py-3 px-2 text-right">Wins</th>
                <th className="hidden py-3 px-2 text-right sm:table-cell">Losses</th>
                <th className="hidden py-3 px-2 text-right sm:table-cell">Draws</th>
                <th className="hidden py-3 pr-4 pl-2 text-right sm:table-cell">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerPubkey}
                  className="border-b border-border last:border-0 transition-colors hover:bg-card-hover"
                >
                  <td className="py-3 pl-4 pr-2">{rankIcon(entry.rank)}</td>
                  <td className="py-3 px-2">
                    <Link
                      href={profileHref(entry.playerPubkey)}
                      className="inline-flex items-center gap-2 text-sm hover:text-primary hover:underline"
                    >
                      <PlayerAvatar wallet={entry.playerPubkey} avatar={entry.avatar} size="sm" />
                      <span className="truncate">
                        {playerLabel(entry.playerPubkey, entry.displayName)}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 px-2 text-right text-sm font-semibold tnum">
                    {entry.rating ?? "—"}
                  </td>
                  <td className="py-3 px-2 text-right text-xs tnum text-muted-foreground">
                    {entry.level ? (
                      <span title={`${entry.xp ?? 0} XP`}>
                        {entry.level} <span className="hidden sm:inline">{entry.tier}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden py-3 px-2 text-right text-sm sm:table-cell">{entry.totalGames}</td>
                  <td className="py-3 px-2 text-right text-sm text-success">{entry.wins}</td>
                  <td className="hidden py-3 px-2 text-right text-sm text-destructive sm:table-cell">{entry.losses}</td>
                  <td className="hidden py-3 px-2 text-right text-sm text-muted-foreground sm:table-cell">{entry.draws}</td>
                  <td className="hidden py-3 pr-4 pl-2 text-right text-sm font-medium sm:table-cell">
                    {(entry.winRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <section className="mt-14" aria-labelledby="predictors-heading">
        <h2 id="predictors-heading" className="font-display text-3xl">
          Top predictors
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Play points from calling moves in live games.</p>
        <div className="panel mt-4 overflow-x-auto">
          {predictors === null ? (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">Loading…</div>
          ) : predictors.length === 0 ? (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">
              No predictions settled yet.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 pl-4 pr-2">#</th>
                  <th className="py-3 px-2">Predictor</th>
                  <th className="py-3 px-2 text-right">Called</th>
                  <th className="py-3 px-2 text-right">Missed</th>
                  <th className="py-3 pr-4 pl-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {predictors.map((entry) => (
                  <tr key={entry.wallet} className="border-b border-border last:border-0 transition-colors hover:bg-card-hover">
                    <td className="py-3 pl-4 pr-2">{rankIcon(entry.rank)}</td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {entry.wallet.slice(0, 4)}...{entry.wallet.slice(-4)}
                    </td>
                    <td className="py-3 px-2 text-right text-sm text-success">{entry.betsWon}</td>
                    <td className="py-3 px-2 text-right text-sm text-muted-foreground">{entry.betsLost}</td>
                    <td className="py-3 pr-4 pl-2 text-right text-sm font-medium tnum">
                      {entry.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
