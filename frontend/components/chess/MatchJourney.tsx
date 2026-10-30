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
  /** For an open match: when it starts and whether it can be joined yet. */
  start?: { phase: "upcoming" | "open" | "expired"; scheduled: boolean; label: string } | null;
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
    start,
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
        ? "Free game: nothing to pay out, but it still counts for rating and XP."
        : `White's ${wagerLabel} stake is locked in escrow on Solana. Nobody can touch it until the game ends.`,
    },
    {
      title: "Opponent joins",
      state: isWaiting ? "current" : "done",
      body: isWaiting
        ? start?.phase === "expired"
          ? isCreator
            ? "Nobody joined within the hour. Cancel to get your stake back, or start a new match."
            : "Nobody joined within the hour. Ask the creator for a new match."
          : start?.phase === "upcoming"
            ? isCreator
              ? `Starts ${start.label}. Send the link now; your opponent can join from then, and you can cancel for a refund until someone does.`
              : `Starts ${start.label}. Come back then to take the black pieces${isFree ? "" : `; joining locks your ${wagerLabel} stake`}.`
            : isCreator
              ? "Share the invite link. Until someone joins you can cancel for a refund."
              : isFree
                ? "Join to start the game."
                : `Joining locks your ${wagerLabel} stake in the same escrow and starts the game.`
        : isFree
          ? "Both players are in."
          : "Both stakes are in escrow.",
    },
    {
      title: "Play",
      state: isWaiting ? "todo" : isActive ? "current" : "done",
      body: isFinished
        ? endDetail ?? "The game is over."
        : flagged
          ? "A clock ran out. The other player can now claim the win."
          : moveTimeoutSeconds > 0
            ? `${formatSeconds(moveTimeoutSeconds)} per move. Run out and the other player can claim the win.`
            : "Every move is recorded on-chain.",
    },
    {
      title: "Save the result to Solana",
      state: !isFinished ? "todo" : needsCommit ? "current" : "done",
      busy: settlePhase === "committing",
      body: !isFinished
        ? "The final board moves back to Solana."
        : settlePhase === "committing"
          ? "Saving the final board to Solana…"
          : needsCommit
            ? isPlayer
              ? isFree
                ? "Press “Save result to Solana” to close the match. Either player can."
                : "Press “Collect the pot” (or “Save result and pay out”) to finish. Either player can, and the escrow pays out on its own after that."
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
            ? `${payoutDetail ?? "Closes the match."} Either player can settle.`
            : needsPayout
              ? "Waiting for a player to settle the payout."
              : payoutDetail ?? "The escrow pays out once the result is on Solana.",
    },
  ];

  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.state === "current")
  );
  const allDone = steps.every((step) => step.state === "done");
  const current = allDone ? steps[steps.length - 1] : steps[currentIndex];

  return (
    <section className={cn("panel p-4", className)} aria-labelledby="journey-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journey-heading" className="section-title flex items-center gap-2">
          {current.busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          ) : null}
          {current.title}
        </h2>
        <span className="text-xs text-muted-foreground tnum">
          {allDone ? "Done" : `Step ${currentIndex + 1} of ${steps.length}`}
        </span>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="Match progress">
        {steps.map((step) => (
          <li
            key={step.title}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "h-1",
              step.state === "done" && "bg-primary",
              step.state === "current" && "bg-primary/45",
              step.state === "todo" && "bg-border"
            )}
          >
            <span className="sr-only">
              {step.title}
              {step.state === "done" ? " (done)" : step.state === "current" ? " (now)" : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">{current.body}</p>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">How this match works</span>
          <span className="hidden group-open:inline">Hide steps</span>
        </summary>
        <ol className="mt-3 space-y-3 border-t border-border pt-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-semibold",
                  step.state === "done" && "bg-primary text-primary-foreground",
                  step.state === "current" && "border border-primary text-primary",
                  step.state === "todo" && "border border-border text-muted-foreground"
                )}
                aria-hidden="true"
              >
                {step.state === "done" ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", step.state === "todo" && "text-muted-foreground")}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
