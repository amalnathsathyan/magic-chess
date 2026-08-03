"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Filter, Plus, Search } from "lucide-react";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";

// Mock match data for scaffolding
const MOCK_MATCHES: MatchCardData[] = [
  {
    matchId: "match_abc123xyz",
    whitePlayer: "7xQW...9mK2",
    wagerAmount: 0.5,
    wagerToken: "SOL",
    timeControl: "5+3",
    status: "open",
    createdAt: Date.now() - 120_000,
  },
  {
    matchId: "match_def456uvw",
    whitePlayer: "3bRT...1nL8",
    blackPlayer: "9yHJ...4pQ7",
    wagerAmount: 2.0,
    wagerToken: "SOL",
    timeControl: "10+5",
    status: "in_progress",
    createdAt: Date.now() - 600_000,
  },
  {
    matchId: "match_ghi789rst",
    whitePlayer: "5mNP...2kF4",
    wagerAmount: 0.1,
    wagerToken: "SOL",
    timeControl: "1+0",
    status: "open",
    createdAt: Date.now() - 60_000,
  },
  {
    matchId: "match_jkl012mno",
    whitePlayer: "8cDW...6vG3",
    blackPlayer: "2fHJ...7tY5",
    wagerAmount: 1.5,
    wagerToken: "SOL",
    timeControl: "15+10",
    status: "in_progress",
    createdAt: Date.now() - 1200_000,
  },
  {
    matchId: "match_pqr345stu",
    whitePlayer: "4bNX...3mL1",
    blackPlayer: "6kTP...9wR8",
    wagerAmount: 10.0,
    wagerToken: "SOL",
    timeControl: "3+2",
    status: "completed",
    createdAt: Date.now() - 3600_000,
  },
];

export default function ArenaPage() {
  const [filter, setFilter] = useState<"all" | "open" | "live">("all");
  const [showCreate, setShowCreate] = useState(false);

  const filteredMatches = MOCK_MATCHES.filter((m) => {
    if (filter === "open") return m.status === "open";
    if (filter === "live") return m.status === "in_progress";
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-heading text-3xl font-bold">The Arena</h1>
        <p className="mt-1 text-muted-foreground">
          Browse live and open matches. Join one or create your own.
        </p>
      </motion.div>

      {/* Toolbar: filter + search + create */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Filters */}
        <div className="flex items-center gap-2">
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
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search matches..."
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
