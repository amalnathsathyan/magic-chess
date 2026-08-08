"use client";

import Link from "next/link";
import { Clock, Coins, Eye, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MatchCardData {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerDisplay: string;
  wagerMint: string;
  wagerKind: "entry" | "pot";
  timeControl: string;
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
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-xs text-muted-foreground">
          #{match.matchId}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            isOpen && "bg-primary/10 text-primary",
            isInProgress && "bg-accent/10 text-accent",
            match.status === "completed" && "bg-card text-muted-foreground"
          )}
        >
          {isOpen ? "Open" : isInProgress ? "Live" : "Completed"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="font-mono text-sm" title={match.whitePlayer}>
            {shortenAddress(match.whitePlayer)}
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
              <Coins className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="font-mono text-sm font-semibold tabular-nums">
                {match.wagerDisplay}
              </span>
              <span className="text-xs text-muted-foreground">
                {match.wagerKind === "entry" ? "entry" : "pot"}
              </span>
            </div>
            <p className="mt-1 max-w-52 truncate pl-5 font-mono text-xs text-muted-foreground" title={match.wagerMint}>
              Mint {shortenAddress(match.wagerMint)}
            </p>
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
