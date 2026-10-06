"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, Sparkles } from "lucide-react";
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

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-accent" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-accent" />;
    return <span className="text-sm text-muted-foreground w-5 text-center">{rank}</span>;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-4xl sm:text-5xl">Ladder</h1>
        <p className="mt-1 text-muted-foreground">
          Rating measures strength: everyone starts at 1200. XP rewards playing: every finished game earns it.
        </p>
      </motion.div>

      {/* Sort controls */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["rating", "xp", "wins", "winRate", "totalGames"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              sortBy === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border-hover"
            }`}
          >
            {s === "rating"
              ? "Rating"
              : s === "xp"
                ? "XP"
                : s === "wins"
                ? "Most Wins"
                : s === "winRate"
                  ? "Win Rate"
                  : "Most Games"}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="mt-4 glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="flex justify-center py-12 text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Trophy className="mb-3 h-10 w-10" />
            <p>No players yet. Play a match to appear here.</p>
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
                <th className="hidden py-3 pr-4 pl-2 text-right sm:table-cell">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerPubkey}
                  className="border-b border-border/50 hover:bg-card/50 transition-colors"
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
                  <td className="py-3 px-2 text-right font-mono text-sm font-semibold tabular-nums">
                    {entry.rating ?? "—"}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
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

      <section className="mt-10" aria-labelledby="predictors-heading">
        <h2 id="predictors-heading" className="flex items-center gap-2 font-heading text-xl font-bold">
          <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
          Top predictors
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Spectators who best call moves in live games. Play points only.
        </p>
        <div className="mt-4 glass-card overflow-hidden">
          {predictors === null ? (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">Loading...</div>
          ) : predictors.length === 0 ? (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">
              No predictions settled yet. Watch a live game and call the next move.
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
                  <tr key={entry.wallet} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                    <td className="py-3 pl-4 pr-2">{rankIcon(entry.rank)}</td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {entry.wallet.slice(0, 4)}...{entry.wallet.slice(-4)}
                    </td>
                    <td className="py-3 px-2 text-right text-sm text-success">{entry.betsWon}</td>
                    <td className="py-3 px-2 text-right text-sm text-muted-foreground">{entry.betsLost}</td>
                    <td className="py-3 pr-4 pl-2 text-right font-mono text-sm font-medium">
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
