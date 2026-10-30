"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ApiMatch } from "@/lib/api";
import { formatEndReason, outcomeFor, resultScore, timeAgo } from "@/lib/game-result";
import { reviewHref } from "@/lib/match-links";
import { formatRatingChange, playerLabel } from "@/lib/players";
import { formatStake } from "@/lib/stake-tokens";
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
        "row-link group flex items-center gap-3 px-4 py-3",
        className
      )}
    >
      {outcome ? (
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold",
            outcome === "win" && "bg-success/15 text-success",
            outcome === "loss" && "bg-destructive/15 text-destructive",
            outcome === "draw" && "bg-accent/15 text-accent"
          )}
          aria-label={outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Draw"}
        >
          {outcome === "win" ? "W" : outcome === "loss" ? "L" : "D"}
        </span>
      ) : viewer ? (
        // Keeps rows aligned when the viewer didn't play this one.
        <span className="w-7 shrink-0" aria-hidden="true" />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <Side
            wallet={match.whitePlayer}
            name={match.whiteName}
            rating={match.whiteRating}
            change={match.whiteRatingChange}
          />
          <span className="hidden shrink-0 text-xs font-semibold tnum text-muted-foreground sm:inline">
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
          {score ? <span className="font-semibold tnum text-foreground sm:hidden">{score}, </span> : null}
          {reason ? `${reason}, ` : ""}
          {match.moveCount} moves, {timeAgo(match.endedAt ?? match.lastMoveAt)}
        </p>
      </div>

      <span className="w-24 shrink-0 text-right text-sm font-semibold tnum">
        {wager > 0n ? (
          (() => {
            const [amount, symbol] = formatStake(wager, match.bettingTokenMint).split(" ");
            return (
              <>
                {amount}
                {symbol ? <span className="ml-1 text-xs font-normal text-muted-foreground">{symbol}</span> : null}
              </>
            );
          })()
        ) : (
          <span className="font-normal text-muted-foreground">Free</span>
        )}
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground sm:block" aria-hidden="true" />
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
        <span className="hidden shrink-0 text-xs tnum text-muted-foreground sm:inline">
          {rating}
          <RatingDelta change={change} />
        </span>
      ) : null}
    </span>
  );
}
