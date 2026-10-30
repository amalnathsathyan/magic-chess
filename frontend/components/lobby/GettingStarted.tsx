"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Check, X } from "lucide-react";
import { useAppLogin } from "@/hooks/useAppLogin";
import { useFaucet } from "@/hooks/useFaucet";
import { DEFAULT_STAKE_TOKEN } from "@/lib/stake-tokens";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "zug:getting-started:dismissed";

/**
 * Three numbered steps for someone who has never used a crypto app: sign in,
 * claim play tokens, start a match. Each step ticks off as it happens and the
 * card goes away on its own once all three are done (or when dismissed).
 */
export function GettingStarted({
  walletAddress,
  hasPlayed,
  onCreate,
  className,
}: {
  walletAddress: string | null;
  /** The wallet has created, joined or finished at least one match. */
  hasPlayed: boolean;
  onCreate: () => void;
  className?: string;
}) {
  const { ready, authenticated } = usePrivy();
  const login = useAppLogin();
  const faucet = useFaucet(walletAddress);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const signedIn = ready && authenticated && Boolean(walletAddress);
  const faucetStatus = faucet.status?.enabled ? faucet.status : null;
  const faucetOn = faucetStatus !== null;
  const claimed = signedIn && Number(faucetStatus?.wallet?.totalClaimed ?? 0) > 0;
  const symbol =
    faucetStatus?.mint === DEFAULT_STAKE_TOKEN.mint
      ? DEFAULT_STAKE_TOKEN.symbol
      : faucetStatus?.symbol ?? DEFAULT_STAKE_TOKEN.symbol;

  if (!ready || dismissed) return null;
  if (signedIn && hasPlayed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do: the card simply shows again next time.
    }
  };

  const steps: Array<{ title: string; body: string; done: boolean; action?: { label: string; run: () => void } }> = [
    {
      title: "Sign in",
      body: "Email, Google or Discord is enough. We make your Solana wallet for you; nothing to install.",
      done: signedIn,
      action: signedIn ? undefined : { label: "Sign in", run: () => login() },
    },
    ...(faucetOn
      ? [
          {
            title: `Claim free ${symbol}`,
            body: "Play tokens for devnet. They are not money, and the first claim covers plenty of games.",
            done: claimed,
            action:
              signedIn && !claimed && faucetStatus?.wallet?.available
                ? { label: `Claim ${symbol}`, run: () => void faucet.claim().catch(() => undefined) }
                : undefined,
          },
        ]
      : []),
    {
      title: "Start a match",
      body: "Pick a stake (or play free) and a clock, then send the link to a friend or wait in the lobby.",
      done: hasPlayed,
      action: signedIn && !hasPlayed ? { label: "New match", run: onCreate } : undefined,
    },
  ];
  const nextIndex = steps.findIndex((step) => !step.done);

  return (
    <section className={cn("panel relative mb-6", className)} aria-labelledby="getting-started-heading">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="getting-started-heading" className="section-title">
          New here? Three steps to your first game
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide getting started"
          className="-mr-2 flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ol className="grid gap-px bg-border sm:grid-cols-3">
        {steps.map((step, index) => {
          const current = index === nextIndex;
          return (
            <li key={step.title} className={cn("flex flex-col gap-3 bg-card p-4", current && "bg-primary/[0.06]")}>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center font-heading text-lg font-black [font-stretch:125%]",
                    step.done
                      ? "bg-primary text-primary-foreground"
                      : current
                        ? "border border-primary text-primary"
                        : "border border-border text-muted-foreground"
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <p className={cn("text-sm font-semibold", step.done && "text-muted-foreground line-through decoration-border-hover")}>
                  {step.title}
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              {step.action ? (
                <button
                  type="button"
                  onClick={step.action.run}
                  disabled={faucet.claiming && step.title.startsWith("Claim")}
                  className={cn("btn btn-sm mt-auto self-start", current ? "btn-primary" : "btn-secondary")}
                >
                  {faucet.claiming && step.title.startsWith("Claim") ? "Sending…" : step.action.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Everything here runs on Solana devnet with test tokens. Nothing is real money.
      </p>
    </section>
  );
}
