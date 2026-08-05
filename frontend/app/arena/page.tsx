"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Filter, Plus, Search } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import { 
  lobbyFilterAtom, 
  lobbyWagerFilterAtom, 
  lobbyTimeFilterAtom, 
  lobbySearchAtom 
} from "@/store/lobby";
import { walletAddressAtom } from "@/store/wallet";

// Mock match data for scaffolding
const MOCK_MATCHES: MatchCardData[] = [
  {
    matchId: "match_abc123xyz",
    whitePlayer: "7xQW...9mK2",
    wagerAmount: 0,
    wagerToken: "SOL",
    timeControl: "1+0",
    status: "open",
    createdAt: Date.now() - 120_000,
  },
  {
    matchId: "match_def456uvw",
    whitePlayer: "3bRT...1nL8",
    blackPlayer: "9yHJ...4pQ7",
    wagerAmount: 0.1,
    wagerToken: "SOL",
    timeControl: "3+2",
    status: "in_progress",
    createdAt: Date.now() - 600_000,
  },
  {
    matchId: "match_ghi789rst",
    whitePlayer: "5mNP...2kF4",
    wagerAmount: 0.5,
    wagerToken: "SOL",
    timeControl: "10+0",
    status: "open",
    createdAt: Date.now() - 60_000,
  },
  {
    matchId: "match_jkl012mno",
    whitePlayer: "8cDW...6vG3",
    blackPlayer: "2fHJ...7tY5",
    wagerAmount: 1.0,
    wagerToken: "SOL",
    timeControl: "3+2",
    status: "in_progress",
    createdAt: Date.now() - 1200_000,
  },
  {
    matchId: "match_pqr345stu",
    whitePlayer: "4bNX...3mL1",
    blackPlayer: "6kTP...9wR8",
    wagerAmount: 0,
    wagerToken: "SOL",
    timeControl: "10+0",
    status: "completed",
    createdAt: Date.now() - 3600_000,
  },
];

import { useMatches } from "@magic-chess/sdk/react";

export default function ArenaPage() {
  const [filter, setFilter] = useAtom(lobbyFilterAtom);
  const [wagerFilter, setWagerFilter] = useAtom(lobbyWagerFilterAtom);
  const [timeFilter, setTimeFilter] = useAtom(lobbyTimeFilterAtom);
  const [search, setSearch] = useAtom(lobbySearchAtom);
  const [showCreate, setShowCreate] = useState(false);
  const [localMatches, setLocalMatches] = useState<MatchCardData[]>([]);
  const walletAddress = useAtomValue(walletAddressAtom);

  const { matches: liveMatches, loading } = useMatches();

  const sdkMatches: MatchCardData[] = (liveMatches || []).map((m: any) => ({
    matchId: m.matchId,
    whitePlayer: m.playerOne?.toBase58() || "Unknown",
    blackPlayer: m.playerTwo?.toBase58(),
    wagerAmount: m.betAmount ? Number(m.betAmount) / 1e9 : 0,
    wagerToken: "SOL",
    timeControl: m.moveTimeoutDuration ? `${m.moveTimeoutDuration / 60}+0` : "Unknown",
    status: m.state?.joinable ? "open" : (m.state?.inProgress ? "in_progress" : "completed"),
    createdAt: Date.now(), // Fallback if no creation time
  }));

  const allMatches = [...localMatches, ...sdkMatches];

  const filteredMatches = allMatches.filter((m) => {
    if (filter === "open" && m.status !== "open") return false;
    if (filter === "live" && m.status !== "in_progress") return false;

    if (wagerFilter !== "all") {
      if (wagerFilter === "free" && m.wagerAmount !== 0) return false;
      if (wagerFilter === "0.1" && m.wagerAmount !== 0.1) return false;
      if (wagerFilter === "0.5" && m.wagerAmount !== 0.5) return false;
      if (wagerFilter === "1.0" && m.wagerAmount !== 1.0) return false;
    }

    if (timeFilter !== "all" && m.timeControl !== timeFilter) return false;

    if (search) {
      const q = search.toLowerCase();
      if (!m.matchId.toLowerCase().includes(q) && 
          !m.whitePlayer.toLowerCase().includes(q) && 
          !m.blackPlayer?.toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-3xl font-bold">Lobby Arena</h1>
          <p className="mt-1 text-muted-foreground">
            Browse live and open matches. Join one or create your own.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10 hover:text-accent transition-colors">
            Quick Play
          </button>
          <button className="rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10 hover:text-accent transition-colors">
            Play vs Computer
          </button>
          <button className="rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10 hover:text-accent transition-colors">
            Pass & Play
          </button>
        </div>
      </motion.div>

      {/* Toolbar: filter + search + create */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "open", "live"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  filter === f
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "open" ? "Open" : "Live"}
              </button>
            ))}
            
            <div className="h-4 w-px bg-border mx-2 hidden sm:block" />
            
            {/* Wager Filters */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { value: "all", label: "Any Wager" },
                { value: "free", label: "Free" },
                { value: "0.1", label: "0.1 SOL" },
                { value: "0.5", label: "0.5 SOL" },
                { value: "1.0", label: "1.0 SOL" }
              ].map((w) => (
                <button
                  key={w.value}
                  onClick={() => setWagerFilter(w.value as any)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    wagerFilter === w.value
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border mx-2 hidden sm:block" />

            {/* Time Control Filters */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { value: "all", label: "Any Time" },
                { value: "1+0", label: "Bullet 1+0" },
                { value: "3+2", label: "Blitz 3+2" },
                { value: "10+0", label: "Rapid 10+0" }
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTimeFilter(t.value as any)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    timeFilter === t.value
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search matches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 font-mono text-xs text-foreground placeholder:text-muted focus:border-primary/50 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>
        </div>
      </div>

      {/* Create match form (modal) */}
      <CreateMatchForm
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(data) => {
          const newMatch: MatchCardData = {
            matchId: `demo-${Date.now()}`,
            whitePlayer: walletAddress || "You",
            wagerAmount: data.wagerAmount,
            wagerToken: data.wagerToken,
            timeControl: `${data.timeControlMinutes}+${data.timeIncrementSeconds}`,
            status: "open",
            createdAt: Date.now(),
            isLocal: true,
          };
          setLocalMatches((prev) => [newMatch, ...prev]);
          setShowCreate(false);
        }}
      />

      {/* Match list */}
      <div className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-8 text-muted-foreground">Loading matches...</div>
        ) : filteredMatches.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-16">
            <Filter className="mb-3 h-10 w-10 text-muted" />
            <p className="text-muted-foreground">No matches found</p>
            <p className="text-sm text-muted">
              Try changing filters or create a new match
            </p>
          </div>
        ) : (
          filteredMatches.map((match) => (
            <MatchCard key={match.matchId} match={match} />
          ))
        )}
      </div>
    </div>
  );
}
