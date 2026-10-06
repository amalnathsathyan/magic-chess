"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ApiMatch } from "@/lib/api";
import { formatEndReason, outcomeFor, resultScore, timeAgo } from "@/lib/game-result";
import { reviewHref } from "@/lib/match-links";
import { formatRatingChange, playerLabel } from "@/lib/players";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";
import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { cn } from "@/lib/utils";

/**
 * One finished game, as the lobby and profile list them: who played, how it
 * ended, and a link into the replay.
 */
export function FinishedGameCard({
  match,
  viewer,
  className,
}: {
  match: ApiMatch;
  /** When set, the card is written from this wallet's point of view. */
  viewer?: string | null;
  className?: string;
}) {
  const viewerColor =
    viewer && match.whitePlayer === viewer
      ? "white"
      : viewer && match.blackPlayer === viewer
        ? "black"
        : null;
  const outcome = viewerColor ? outcomeFor(match.gameStatus, viewerColor) : null;
  const score = resultScore(match.gameStatus);
  const reason = formatEndReason(match.gameEndReason);
  const wager = BigInt(match.betAmountPerPlayer ?? "0");

  return (
    <Link
      href={reviewHref(match.matchId)}
      className={cn(
        "group glass-card flex items-center gap-3 p-3 transition-all hover:border-border-hover hover:shadow-glow focus-visible:ring-2 focus-visible:ring-primary",
        outcome === "win" && "border-l-2 border-l-success/60",
        outcome === "loss" && "border-l-2 border-l-destructive/60",
        outcome === "draw" && "border-l-2 border-l-accent/60",
        className
      )}
    >
      {outcome ? (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold",
            outcome === "win" && "border-success/20 bg-success/10 text-success",
            outcome === "loss" && "border-destructive/20 bg-destructive/10 text-destructive",
            outcome === "draw" && "border-accent/20 bg-accent/10 text-accent"
          )}
          aria-label={outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Draw"}
        >
          {outcome === "win" ? "W" : outcome === "loss" ? "L" : "D"}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <Side
            wallet={match.whitePlayer}
            name={match.whiteName}
            rating={match.whiteRating}
            change={match.whiteRatingChange}
          />
          <span className="hidden shrink-0 font-mono text-xs font-semibold text-muted-foreground sm:inline">
            {score ?? "vs"}
          </span>
          {match.blackPlayer ? (
            <Side
              wallet={match.blackPlayer}
              name={match.blackName}
              rating={match.blackRating}
              change={match.blackRatingChange}
            />
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {score ? <span className="font-mono font-semibold text-foreground sm:hidden">{score} · </span> : null}
          {reason ? `${reason} · ` : ""}
          {match.moveCount} moves
          {wager > 0n ? ` · ${formatTokenAmount(wager)} ${solanaConfig.wagerSymbol}` : " · Free"}
          {" · "}
          {timeAgo(match.endedAt ?? match.lastMoveAt)}
        </p>
      </div>

      <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary group-hover:underline sm:inline-flex">
        Replay
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function RatingDelta({ change }: { change?: number | null }) {
  const label = formatRatingChange(change);
  if (!label) return null;
  return (
    <span
      className={cn(
        "ml-1",
        (change ?? 0) > 0 && "text-success",
        (change ?? 0) < 0 && "text-destructive"
      )}
    >
      {label}
    </span>
  );
}

function Side({
  wallet,
  name,
  rating,
  change,
}: {
  wallet: string;
  name?: string | null;
  rating?: number | null;
  change?: number | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PlayerAvatar wallet={wallet} size="sm" />
      <span className="truncate text-sm font-medium">{playerLabel(wallet, name)}</span>
      {rating != null ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {rating}
          <RatingDelta change={change} />
        </span>
      ) : null}
    </span>
  );
}
