"use client";

import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type StepState = "done" | "current" | "todo";

export type SettlePhase = "idle" | "committing" | "paying";

export interface MatchJourneyProps {
  isWaiting: boolean;
  isActive: boolean;
  isFinished: boolean;
  isDelegated: boolean;
  payoutProcessed: boolean;
  /** "white" | "black" for a player, null for a spectator. */
  playerColor: "white" | "black" | null;
  isCreator: boolean;
  /** Free games have no wager or payout. */
  isFree: boolean;
  /** e.g. "0.1 WSOL", already formatted. */
  wagerLabel: string;
  moveTimeoutSeconds: number;
  /** A clock ran out but nobody has claimed the win yet. */
  flagged: boolean;
  /** Why the game ended, worded for this viewer. */
  endDetail: string | null;
  /** What the payout sends, worded for this viewer. */
  payoutDetail: string | null;
  settlePhase: SettlePhase;
  className?: string;
}

interface Step {
  title: string;
  state: StepState;
  body: string;
  busy?: boolean;
}

function formatSeconds(total: number): string {
  if (total % 60 === 0 && total >= 60) {
    const minutes = total / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${total} seconds`;
}

/**
 * Where the match is, step by step, and what (if anything) the viewer has to
 * do next. Everything here comes from the on-chain match account.
 */
export function MatchJourney(props: MatchJourneyProps) {
  const {
    isWaiting,
    isActive,
    isFinished,
    isDelegated,
    payoutProcessed,
    playerColor,
    isCreator,
    isFree,
    wagerLabel,
    moveTimeoutSeconds,
    flagged,
    endDetail,
    payoutDetail,
    settlePhase,
    className,
  } = props;
  const isPlayer = playerColor !== null;
  const needsCommit = isFinished && isDelegated && !payoutProcessed;
  const needsPayout = isFinished && !isDelegated && !payoutProcessed;

  const steps: Step[] = [
    {
      title: "Match created",
      state: "done",
      body: isFree
        ? "Free game: no wager, nothing to pay out."
        : `${wagerLabel} from White is locked in an on-chain escrow.`,
    },
    {
      title: "Opponent joins",
      state: isWaiting ? "current" : "done",
      body: isWaiting
        ? isCreator
          ? "Share the invite link. Until someone joins you can cancel and get your wager back."
          : isFree
            ? "Join to start the game."
            : `Joining locks your ${wagerLabel} in the same escrow and starts the game.`
        : isFree
          ? "Both players are in. The game moved to MagicBlock for instant, fee-free moves."
          : "Both wagers are in escrow. The game moved to MagicBlock for instant, fee-free moves.",
    },
    {
      title: "Play",
      state: isWaiting ? "todo" : isActive ? "current" : "done",
      body: isFinished
        ? endDetail ?? "The game is over."
        : flagged
          ? "A clock ran out. The other player can now claim the win."
          : moveTimeoutSeconds > 0
            ? `Every move is recorded on-chain. Each side has ${formatSeconds(moveTimeoutSeconds)} per move; run out and the other player can claim the win.`
            : "Every move is recorded on-chain.",
    },
    {
      title: "Save the result to Solana",
      state: !isFinished ? "todo" : needsCommit ? "current" : "done",
      busy: settlePhase === "committing",
      body: !isFinished
        ? "When the game ends, the final board moves from MagicBlock back to Solana."
        : settlePhase === "committing"
          ? "Saving the final board to Solana…"
          : needsCommit
            ? isPlayer
              ? "Nothing is paid until the result is on Solana. Press Finalize below; either player can."
              : "Waiting for a player to finalize the game."
            : "The final board is saved on Solana.",
    },
    {
      title: isFree ? "Close the match" : "Pay out",
      state: payoutProcessed ? "done" : needsPayout ? "current" : "todo",
      busy: settlePhase === "paying",
      body: payoutProcessed
        ? isFree
          ? "The match is closed."
          : `Paid out. ${payoutDetail ?? ""}`.trim()
        : settlePhase === "paying"
          ? "Sending the payout…"
          : needsPayout && isPlayer
            ? `${payoutDetail ?? "Closes the match."} Press Settle payout below; either player can.`
            : needsPayout
              ? "Waiting for a player to settle the payout."
              : payoutDetail ?? "The escrow pays out once the result is on Solana.",
    },
  ];

  return (
    <section className={cn("glass-card p-4", className)} aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="font-heading text-sm font-semibold">
        What&apos;s happening
      </h2>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3" aria-current={step.state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                step.state === "done" && "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary text-primary",
                step.state === "todo" && "border-border text-muted-foreground"
              )}
              aria-hidden="true"
            >
              {step.busy ? (
                <LoaderCircle className="h-3 w-3 animate-spin" />
              ) : step.state === "done" ? (
                <Check className="h-3 w-3" />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "todo" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.title}
                <span className="sr-only">
                  {step.state === "done" ? " (done)" : step.state === "current" ? " (now)" : ""}
                </span>
              </p>
              {step.state !== "todo" || index === steps.findIndex((s) => s.state === "todo") ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
