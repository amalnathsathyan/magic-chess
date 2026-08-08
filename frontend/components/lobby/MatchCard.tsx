"use client";

import Link from "next/link";
import { Clock, Coins, Eye, User, Zap } from "lucide-react";
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

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function MatchCard({ match, className }: MatchCardProps) {
  const isOpen = match.status === "open";
  const isInProgress = match.status === "in_progress";
  const action = isOpen ? "Join match" : isInProgress ? "Watch live" : "Review game";

  return (
    <Link
      href={`/play/${encodeURIComponent(match.matchId)}`}
      aria-label={`${action}: ${match.matchId}`}
      className={cn(
        "group glass-card block p-5 transition-[border-color,background-color,transform] duration-100 ease-out hover:-translate-y-px hover:border-border-hover hover:bg-card-hover/50 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none",
        className
      )}
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
        <span className="text-sm text-muted-foreground">vs</span>
        {match.blackPlayer ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <User className="h-4 w-4 text-accent" aria-hidden="true" />
            </span>
            <span className="font-mono text-sm" title={match.blackPlayer}>
              {shortenAddress(match.blackPlayer)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Waiting for opponent</span>
        )}
      </div>

      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
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
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-sm tabular-nums">{match.timeControl}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-1">
            <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
            <span className="font-mono text-xs text-primary">On-chain</span>
          </div>
        </div>

        <span className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors duration-100 group-hover:border-primary/40 group-hover:text-primary sm:self-auto">
          {isInProgress ? <Eye className="h-4 w-4" aria-hidden="true" /> : null}
          {action}
        </span>
      </div>
    </Link>
  );
}
