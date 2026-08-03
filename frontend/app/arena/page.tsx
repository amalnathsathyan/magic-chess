"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Filter, Plus, Search } from "lucide-react";
import { useAtom } from "jotai";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import { 
  lobbyFilterAtom, 
  lobbyWagerFilterAtom, 
  lobbyTimeFilterAtom, 
  lobbySearchAtom 
} from "@/store/lobby";

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

export default function ArenaPage() {
  const [filter, setFilter] = useAtom(lobbyFilterAtom);
  const [wagerFilter, setWagerFilter] = useAtom(lobbyWagerFilterAtom);
  const [timeFilter, setTimeFilter] = useAtom(lobbyTimeFilterAtom);
  const [search, setSearch] = useAtom(lobbySearchAtom);
  const [showCreate, setShowCreate] = useState(false);

  // Set mock matches in atom on mount for scaffolding
  useEffect(() => {
    // Ideally this would be set by an SDK listener
  }, []);

  const filteredMatches = MOCK_MATCHES.filter((m) => {
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
          <h1 className="font-heading text-3xl font-bold">The Arena</h1>
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
            <select 
              value={wagerFilter} 
              onChange={(e) => setWagerFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="all">Any Wager</option>
              <option value="free">Free</option>
              <option value="0.1">0.1 SOL</option>
              <option value="0.5">0.5 SOL</option>
              <option value="1.0">1.0 SOL</option>
            </select>

            {/* Time Control Filters */}
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="all">Any Time</option>
              <option value="1+0">Bullet 1+0</option>
              <option value="3+2">Blitz 3+2</option>
              <option value="10+0">Rapid 10+0</option>
            </select>
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

      {/* Create match form (collapsible) */}
      {showCreate && (
        <div className="mb-8">
          <CreateMatchForm
            isOpen={showCreate}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => {
              console.log("Create match:", data);
              setShowCreate(false);
            }}
          />
        </div>
      )}

      {/* Match list */}
      <div className="grid gap-4">
        {filteredMatches.length === 0 ? (
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
