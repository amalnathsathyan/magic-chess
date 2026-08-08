"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Coins, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MatchCardData {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: string;
  wagerToken: string; // "SOL" or SPL mint
  timeControl: string; // e.g. "5+3", "10+0"
  status: "open" | "in_progress" | "completed";
  createdAt: number;
}

interface MatchCardProps {
  match: MatchCardData;
  className?: string;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function MatchCard({ match, className }: MatchCardProps) {
  const isOpen = match.status === "open";
  const isInProgress = match.status === "in_progress";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link
        href={
          isInProgress
            ? `/play/${match.matchId}/spectate`
            : `/play/${match.matchId}`
        }
        className={cn(
          "group glass-card block p-5 transition-all hover:border-border-hover hover:shadow-glow",
          className
        )}
      >
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted">#{match.matchId.slice(0, 8)}</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              isOpen && "bg-primary/10 text-primary",
              isInProgress && "bg-accent/10 text-accent",
              match.status === "completed" && "bg-muted/10 text-muted-foreground"
            )}
          >
            {match.status === "open"
              ? "Open"
              : match.status === "in_progress"
                ? "Live"
                : "Completed"}
          </span>
        </div>

        {/* Players */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <span className="font-mono text-sm">
              {shortenAddress(match.whitePlayer)}
            </span>
          </div>
          <span className="text-sm text-muted">vs</span>
          {match.blackPlayer ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                <User className="h-4 w-4 text-accent" />
              </div>
              <span className="font-mono text-sm">
                {shortenAddress(match.blackPlayer)}
              </span>
            </div>
          ) : (
            <span className="text-sm italic text-muted-foreground">
              Waiting for opponent
            </span>
          )}
        </div>

        {/* Match details */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-accent" />
              <span className="font-mono text-sm font-semibold">
                {match.wagerAmount} {match.wagerToken}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted" />
              <span className="font-mono text-sm">{match.timeControl}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5">
              <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
              <span className="font-mono text-xs text-primary/90">On-chain</span>
            </div>
          </div>
          
          <div>
            {match.status === "open" ? (
              <span className="inline-flex items-center justify-center rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                Join Match
              </span>
            ) : match.status === "in_progress" ? (
              <span className="inline-flex items-center justify-center rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                Spectate
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
