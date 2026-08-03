"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  User,
  Sword,
  Trophy,
  TrendingUp,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock profile stats
const PROFILE = {
  address: "7xQW...9mK2",
  gamesPlayed: 142,
  wins: 89,
  losses: 38,
  draws: 15,
  winRate: 62.7,
  totalWagered: 156.5,
  totalWon: 98.2,
  rating: 1842,
  recentGames: [
    {
      id: "match_1",
      opponent: "3bRT...1nL8",
      result: "win" as const,
      wager: 2.0,
      timeControl: "5+3",
      date: "2 hours ago",
    },
    {
      id: "match_2",
      opponent: "9yHJ...4pQ7",
      result: "loss" as const,
      wager: 1.0,
      timeControl: "3+2",
      date: "5 hours ago",
    },
    {
      id: "match_3",
      opponent: "5mNP...2kF4",
      result: "win" as const,
      wager: 0.5,
      timeControl: "10+5",
      date: "1 day ago",
    },
    {
      id: "match_4",
      opponent: "8cDW...6vG3",
      result: "draw" as const,
      wager: 3.0,
      timeControl: "15+10",
      date: "2 days ago",
    },
  ],
};

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Link
        href="/arena"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Arena
      </Link>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card mb-8 flex flex-col gap-6 p-6 sm:flex-row sm:items-center"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <User className="h-10 w-10 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">{PROFILE.address}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rating:{" "}
            <span className="font-mono font-semibold text-foreground">
              {PROFILE.rating}
            </span>
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/arena"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover"
          >
            <Sword className="h-4 w-4" />
            Play Now
          </Link>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            icon: Sword,
            label: "Games",
            value: PROFILE.gamesPlayed,
          },
          {
            icon: Trophy,
            label: "Win Rate",
            value: `${PROFILE.winRate}%`,
          },
          {
            icon: TrendingUp,
            label: "Total Won",
            value: `${PROFILE.totalWon} SOL`,
          },
          {
            icon: Clock,
            label: "Wagered",
            value: `${PROFILE.totalWagered} SOL`,
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4 text-center"
          >
            <stat.icon className="mx-auto mb-2 h-5 w-5 text-muted" />
            <p className="font-mono text-xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent games */}
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold">
          Recent Games
        </h2>
        <div className="space-y-3">
          {PROFILE.recentGames.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold",
                    game.result === "win" && "bg-primary/10 text-primary",
                    game.result === "loss" && "bg-destructive/10 text-destructive",
                    game.result === "draw" && "bg-accent/10 text-accent"
                  )}
                >
                  {game.result === "win"
                    ? "W"
                    : game.result === "loss"
                      ? "L"
                      : "D"}
                </div>
                <div>
                  <p className="text-sm font-medium">vs {game.opponent}</p>
                  <p className="text-xs text-muted">
                    {game.timeControl} &middot; {game.wager} SOL
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted">{game.date}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
