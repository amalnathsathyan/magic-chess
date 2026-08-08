"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal } from "lucide-react";
import { api, type ApiLeaderboardEntry } from "@/lib/api";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<ApiLeaderboardEntry[]>([]);
  const [sortBy, setSortBy] = useState<"wins" | "winRate" | "totalGames">("wins");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getLeaderboard({ sortBy, limit: 50 })
      .then((data) => setEntries(data.leaderboard))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [sortBy]);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm text-muted-foreground w-5 text-center">{rank}</span>;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">Leaderboard</h1>
        <p className="mt-1 text-muted-foreground">Top players ranked by performance.</p>
      </motion.div>

      {/* Sort controls */}
      <div className="mt-6 flex gap-2">
        {(["wins", "winRate", "totalGames"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              sortBy === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border-hover"
            }`}
          >
            {s === "wins" ? "Most Wins" : s === "winRate" ? "Win Rate" : "Most Games"}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="mt-4 glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="flex justify-center py-12 text-red-400">{error}</div>
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
                <th className="py-3 px-2 text-right">Games</th>
                <th className="py-3 px-2 text-right">Wins</th>
                <th className="py-3 px-2 text-right">Losses</th>
                <th className="py-3 px-2 text-right">Draws</th>
                <th className="py-3 pr-4 pl-2 text-right">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerPubkey}
                  className="border-b border-border/50 hover:bg-card/50 transition-colors"
                >
                  <td className="py-3 pl-4 pr-2">{rankIcon(entry.rank)}</td>
                  <td className="py-3 px-2 font-mono text-xs">
                    {entry.playerPubkey.slice(0, 4)}...{entry.playerPubkey.slice(-4)}
                  </td>
                  <td className="py-3 px-2 text-right text-sm">{entry.totalGames}</td>
                  <td className="py-3 px-2 text-right text-sm text-emerald-400">{entry.wins}</td>
                  <td className="py-3 px-2 text-right text-sm text-red-400">{entry.losses}</td>
                  <td className="py-3 px-2 text-right text-sm text-muted-foreground">{entry.draws}</td>
                  <td className="py-3 pr-4 pl-2 text-right text-sm font-medium">
                    {(entry.winRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
