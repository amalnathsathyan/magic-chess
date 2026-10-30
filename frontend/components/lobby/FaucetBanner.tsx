"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Coins, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ZugSymbol } from "@/components/brand/ZugLogo";
import { useAppLogin } from "@/hooks/useAppLogin";
import { useFaucet } from "@/hooks/useFaucet";
import { solanaDevnetTxUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import { DEFAULT_STAKE_TOKEN } from "@/lib/stake-tokens";

/**
 * Devnet only: the free ZUG claim. Players get 10,000 ZUG on their first
 * claim and 1,000 ZUG once a day after that, so they can stake in matches
 * without holding SOL. Remove with the faucet when the app goes to mainnet.
 *
 * - `banner`: the lobby's full-width call to action.
 * - `card`: a compact row for the create-match form and the join panel.
 */
export function FaucetBanner({
  walletAddress,
  variant = "banner",
  className,
  /** Card variant: hide when nothing can be claimed right now. */
  onlyWhenClaimable = false,
  /** Extra line for the card, e.g. "You need 100 ZUG to join." */
  reason,
}: {
  walletAddress: string | null | undefined;
  variant?: "banner" | "card";
  className?: string;
  onlyWhenClaimable?: boolean;
  reason?: string | null;
}) {
  const { authenticated } = usePrivy();
  const login = useAppLogin();
  const faucet = useFaucet(walletAddress);
  const [now, setNow] = useState(() => Date.now());

  const status = faucet.status;
  const nextAt = status?.enabled ? status.wallet?.nextAt ?? null : null;
  useEffect(() => {
    if (!nextAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [nextAt]);

  if (!status?.enabled) return null;
  const amounts = {
    signup: status.signupAmount.toLocaleString("en-US"),
    daily: status.dailyAmount.toLocaleString("en-US"),
  };
  // The dropdown shows the app's display symbol (NEXT_PUBLIC_WAGER_SYMBOL); say the same here.
  const symbol = status.mint === DEFAULT_STAKE_TOKEN.mint ? DEFAULT_STAKE_TOKEN.symbol : status.symbol;
  const available = status.wallet?.available ?? null;
  const signedIn = authenticated && Boolean(walletAddress);
  const empty = status.treasuryRemaining !== null && Number(status.treasuryRemaining) < status.dailyAmount;

  if (onlyWhenClaimable && signedIn && !available) return null;
  if (empty) return null;

  const handleClaim = async () => {
    if (!signedIn) {
      login();
      return;
    }
    try {
      const result = await faucet.claim();
      if (!result) return;
      toast.success(`${result.amount.toLocaleString("en-US")} ${symbol} is in your wallet`, {
        description: (
          <a
            href={solanaDevnetTxUrl(result.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary-hover"
          >
            {result.signature.slice(0, 8)}…{result.signature.slice(-8)} ↗
          </a>
        ),
      });
    } catch (error) {
      toast.error("Couldn't claim", {
        description: error instanceof Error ? error.message : "Try again in a minute.",
      });
    }
  };

  const claimLabel = !signedIn
    ? `Sign in and claim ${amounts.signup} ${symbol}`
    : available === "signup"
      ? `Claim ${amounts.signup} ${symbol}`
      : available === "daily"
        ? `Claim today's ${amounts.daily} ${symbol}`
        : null;
  const countdown = nextAt ? formatCountdown(Date.parse(nextAt) - now) : null;

  const button = claimLabel ? (
    <button
      type="button"
      onClick={() => void handleClaim()}
      disabled={faucet.claiming}
      aria-busy={faucet.claiming}
      className={cn("btn btn-primary shrink-0", variant === "card" && "btn-sm")}
    >
      {faucet.claiming ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Coins className="h-4 w-4" aria-hidden="true" />
      )}
      {faucet.claiming ? "Sending…" : claimLabel}
    </button>
  ) : (
    <span className="shrink-0 text-xs text-muted-foreground tnum">
      {countdown ? `Next ${amounts.daily} ${symbol} in ${countdown}` : "Claimed today"}
    </span>
  );

  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 border border-primary/40 bg-primary/5 px-3 py-2.5",
          className
        )}
        role="status"
      >
        <ZugSymbol className="h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {available === "signup" || !signedIn
              ? `${amounts.signup} free ${symbol} to stake with`
              : available === "daily"
                ? `Your daily ${amounts.daily} ${symbol} is ready`
                : `Daily ${symbol} claimed`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reason ?? `Devnet play tokens, no SOL needed. ${amounts.daily} more every day.`}
          </p>
        </div>
        {button}
      </div>
    );
  }

  const headline = !signedIn
    ? `Play with ${amounts.signup} free ${symbol}`
    : available === "signup"
      ? `${amounts.signup} ${symbol} is waiting for you`
      : available === "daily"
        ? `Your daily ${amounts.daily} ${symbol} is ready`
        : `You hold ${Number(status.wallet?.totalClaimed ?? 0).toLocaleString("en-US")} claimed ${symbol}`;

  return (
    <section
      className={cn(
        "panel relative mb-6 overflow-hidden border-primary/50 p-4 sm:p-5",
        className
      )}
      aria-labelledby="faucet-heading"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 bg-primary/10 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <ZugSymbol className="h-10 w-10 shrink-0" title="ZUG" />
        <div className="min-w-0 flex-1">
          <h2 id="faucet-heading" className="flex items-center gap-2 font-display text-2xl leading-tight">
            {headline}
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {signedIn && !available
              ? `Stake it in a match. ${amounts.daily} more arrives every day.`
              : `Stake ${symbol} in matches and take the pot, no SOL needed. ${amounts.signup} ${symbol} on your first claim, then ${amounts.daily} every day.`}
            <span className="ml-1 text-xs uppercase tracking-wide text-muted">Devnet play tokens</span>
          </p>
        </div>
        {button}
      </div>
    </section>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "a moment";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
