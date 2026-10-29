"use client";

import { playHref, reviewHref, spectateHref } from "@/lib/match-links";
import Link from "next/link";
import { useMemo } from "react";
import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { playerLabel } from "@/lib/players";
import { cn } from "@/lib/utils";

export interface MatchCardData {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: string;
  wagerToken: string; // "SOL" or SPL mint
  timeControl: string; // e.g. "60s / move", "180s / move", "600s / move"
  status: "open" | "in_progress" | "completed";
  /** The viewer plays in this match: open the player view, not spectate. */
  isOwn?: boolean;
  createdAt: number;
  /** Human-readable result label, e.g. "White Wins", "Draw". Only for completed matches. */
  result?: string;
  /** Number of full moves played. Only for in-progress or completed matches. */
  moveCount?: number;
}

interface MatchCardProps {
  match: MatchCardData;
  className?: string;
  /** Narrow list (a sidebar): no clock column and no action button. */
  compact?: boolean;
}

/** "60s / move" → "1 min", "600s / move" → "10 min". */
function clockLabel(timeControl: string): string {
  const seconds = Number(timeControl.match(/^(\d+)/)?.[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return timeControl;
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
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

/**
 * One match as a row: who, the stake, the move clock and the one thing to do
 * (join, resume, watch or replay). Rows sit in a bordered list.
 */
export function MatchCard({ match, className, compact = false }: MatchCardProps) {
  const isOpen = match.status === "open";
  const isInProgress = match.status === "in_progress";
  const isCompleted = match.status === "completed";
  const relativeCreatedAt = useMemo(
    () => relativeTime(match.createdAt),
    [match.createdAt]
  );
  const isFree = Number(match.wagerAmount) === 0;

  const action = isOpen
    ? match.isOwn
      ? "Open"
      : "Join"
    : isInProgress
      ? match.isOwn
        ? "Resume"
        : "Watch"
      : "Replay";

  const detail = isOpen
    ? match.isOwn
      ? `Your match, ${relativeCreatedAt}`
      : relativeCreatedAt
    : isInProgress
      ? `Move ${match.moveCount ?? 1}`
      : match.result ?? "Finished";

  return (
    <Link
      href={
        isCompleted
          ? reviewHref(match.matchId)
          : isOpen || match.isOwn
            ? playHref(match.matchId)
            : spectateHref(match.matchId)
      }
      className={cn("row-link group flex items-center gap-3 px-4 py-3.5 sm:gap-4", className)}
    >
      <PlayerAvatar wallet={match.whitePlayer} size="md" className="hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {playerLabel(match.whitePlayer)}
          {match.blackPlayer ? (
            <span className="text-muted-foreground"> vs {playerLabel(match.blackPlayer)}</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>

      <div className={cn("hidden w-20 text-right", !compact && "sm:block")}>
        <p className="text-sm tnum text-soft">{clockLabel(match.timeControl)}</p>
        <p className="text-xs text-muted-foreground">per move</p>
      </div>

      <div className="w-20 shrink-0 text-right sm:w-24">
        <p className={cn("text-base font-semibold tnum", isFree ? "text-soft" : "text-foreground")}>
          {isFree ? "Free" : match.wagerAmount}
        </p>
        <p className="text-xs text-muted-foreground">
          {isFree ? "no stake" : match.wagerToken}
        </p>
      </div>

      <span
        className={cn(
          "btn btn-sm w-[4.5rem] shrink-0",
          compact && "hidden",
          (isOpen && !match.isOwn) || (isInProgress && match.isOwn)
            ? "bg-primary/15 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
            : "border border-border text-soft group-hover:border-border-hover group-hover:text-foreground"
        )}
      >
        {action}
      </span>
    </Link>
  );
}
