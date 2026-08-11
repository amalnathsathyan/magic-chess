"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Castle, Clock, Coins, Crown, Swords, User, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MatchCardData {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: string;
  wagerToken: string; // "SOL" or SPL mint
  timeControl: string; // e.g. "60s / move", "180s / move", "600s / move"
  status: "open" | "in_progress" | "completed";
  createdAt: number;
  /** Human-readable result label, e.g. "White Wins", "Draw". Only for completed matches. */
  result?: string;
  /** Number of full moves played. Only for in-progress or completed matches. */
  moveCount?: number;
}

interface MatchCardProps {
  match: MatchCardData;
  className?: string;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/** Map time control label to a chess piece icon. */
function getTimeControlIcon(timeControl: string) {
  const seconds = timeControl.match(/^(\d+)/)?.[1];
  switch (seconds) {
    case "60":
      return Swords; // Bullet — fast, aggressive
    case "180":
      return Castle; // Blitz — classic
    case "600":
      return Crown; // Rapid — thoughtful, kingly
    default:
      return Clock;
  }
}

/**
 * Format a timestamp as a relative time string like "2m ago", "1h ago", etc.
 * Accepts a unix-millis timestamp.
 */
function relativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1_000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function MatchCard({ match, className }: MatchCardProps) {
  const isOpen = match.status === "open";
  const isInProgress = match.status === "in_progress";
  const isCompleted = match.status === "completed";
  const TimeIcon = useMemo(
    () => getTimeControlIcon(match.timeControl),
    [match.timeControl]
  );
  const relativeCreatedAt = useMemo(
    () => relativeTime(match.createdAt),
    [match.createdAt]
  );

  return (
    <Link
      href={
        isOpen
          ? `/play/${match.matchId}`
          : `/play/${match.matchId}/spectate`
      }
      className={cn(
        "group glass-card block p-5 transition-all hover:border-border-hover hover:shadow-glow",
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">
            #{match.matchId.slice(0, 8)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {relativeCreatedAt}
          </span>
          {isCompleted && match.moveCount != null && (
            <span className="text-[11px] text-muted-foreground">
              &middot; {match.moveCount} moves
            </span>
          )}
          {isInProgress && match.moveCount != null && (
            <span className="text-[11px] text-muted-foreground">
              &middot; move {match.moveCount}
            </span>
          )}
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            isOpen && "bg-primary/10 text-primary",
            isInProgress && "bg-accent/10 text-accent",
            isCompleted && "bg-muted/10 text-muted-foreground"
          )}
        >
          {isOpen
            ? "Open"
            : isInProgress
              ? "Live"
              : match.result ?? "Completed"}
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
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Wager — more prominent */}
          <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5">
            <Coins className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="font-mono text-base font-bold text-accent">
              {match.wagerAmount}
            </span>
            <span className="text-xs font-medium text-accent/70">
              {match.wagerToken}
            </span>
          </div>
          {/* Time control with piece icon */}
          <div className="flex items-center gap-1.5">
            <TimeIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-sm text-muted-foreground">
              {match.timeControl}
            </span>
          </div>
          {/* On-chain badge */}
          <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5">
            <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
            <span className="font-mono text-xs text-primary/90">On-chain</span>
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {isOpen ? (
            <span className="inline-flex items-center justify-center rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              Join Match
            </span>
          ) : isInProgress ? (
            <span className="inline-flex items-center justify-center rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              Spectate
            </span>
          ) : (
            <span className="inline-flex items-center justify-center rounded-lg bg-muted/20 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
              Review
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
