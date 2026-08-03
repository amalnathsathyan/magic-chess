"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Coins, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MatchCardData {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: number;
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
        href={`/play/${match.matchId}`}
        className={cn(
          "glass-card block p-5 transition-all hover:border-border-hover hover:shadow-glow",
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
        <div className="mt-4 flex items-center gap-5">
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
        </div>
      </Link>
    </motion.div>
  );
}
