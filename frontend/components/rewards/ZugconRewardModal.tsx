"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Coins, ExternalLink, LoaderCircle, X } from "lucide-react";
import type { ApiRewardClaim, ApiRewardStatus } from "@/lib/api";
import type { ClaimPhase } from "@/hooks/useZugconReward";
import { cn } from "@/lib/utils";

const MAINNET_TX = "https://solscan.io/tx";

function formatTokens(amount: number | string): string {
  return Number(amount).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export interface ZugconRewardModalProps {
  status: ApiRewardStatus | null;
  claim: ApiRewardClaim | null;
  phase: ClaimPhase;
  error: string | null;
  onClaim: () => void;
  /** Who the viewer was in this game; the copy differs for creator and joiner. */
  role: "creator" | "joiner" | null;
  className?: string;
}

/**
 * "You earned ZUGCON" banner for a finished game, with a modal that claims
 * it. The reward is a mainnet token, so the banner says so plainly: it
 * lands in the player's wallet on Solana mainnet, not on devnet.
 */
export function ZugconRewardBanner(props: ZugconRewardModalProps) {
  const { status, claim, phase, error, onClaim, role, className } = props;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);

  const eligibility = status?.eligibility ?? null;
  const symbol = status?.symbol ?? "ZUGCON";
  const sent = claim?.status === "sent";
  const claimable = Boolean(status?.enabled && eligibility?.eligible && !sent);
  const amount = eligibility?.amount ?? (claim ? Number(claim.amount) : 0);
  const key = status && eligibility?.role ? `${eligibility.role}:${claimable}:${sent}` : null;

  // Pop the modal once when the reward becomes claimable (or was just paid).
  useEffect(() => {
    if (!key || key === seen) return;
    if (claimable || (sent && phase === "done")) {
      setSeen(key);
      setOpen(true);
    }
  }, [claimable, key, phase, seen, sent]);

  if (!status?.enabled || !eligibility?.role) return null;
  if (!claimable && !sent) return null;

  const busy = phase === "signing" || phase === "sending";
  const roleLine =
    role === "creator"
      ? "for creating this game and seeing it through"
      : "for joining this game and seeing it through";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "panel flex w-full items-center gap-3 border-primary/60 bg-primary/10 p-3 text-left transition hover:bg-primary/15",
          className
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          {sent ? <Check className="h-5 w-5" aria-hidden="true" /> : <Coins className="h-5 w-5" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {sent ? `${formatTokens(amount)} ${symbol} sent to your wallet` : `You earned ${formatTokens(amount)} ${symbol}`}
          </span>
          <span className="block text-xs text-muted-foreground">
            {sent ? "On Solana mainnet. Tap for the transaction." : "A real token on Solana mainnet. Tap to claim, no fee."}
          </span>
        </span>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content className="glass-card fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6 focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="stage-tag">ZUGCON drop</p>
                <Dialog.Title className="font-heading mt-2 text-2xl font-bold">
                  {sent ? "It's in your wallet" : `${formatTokens(amount)} ${symbol} is yours`}
                </Dialog.Title>
              </div>
              <Dialog.Close className="btn btn-sm text-muted-foreground" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <Dialog.Description className="mt-3 text-sm text-muted-foreground">
              {sent
                ? `${formatTokens(amount)} ${symbol} went to this wallet on Solana mainnet. Thanks for playing on ZUG.`
                : `A thank-you ${roleLine}. ${symbol} is a real token on Solana mainnet, sent to this same wallet address. We pay the fee; you sign one message.`}
            </Dialog.Description>

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

            <div className="mt-5 flex flex-col gap-2">
              {sent && claim?.txSignature ? (
                <a
                  href={`${MAINNET_TX}/${claim.txSignature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary w-full"
                >
                  View on Solscan
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : (
                <button type="button" onClick={onClaim} disabled={busy} className="btn btn-primary w-full">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Coins className="h-4 w-4" aria-hidden="true" />}
                  {phase === "signing"
                    ? "Sign in your wallet…"
                    : phase === "sending"
                      ? "Sending on mainnet…"
                      : `Claim ${formatTokens(amount)} ${symbol}`}
                </button>
              )}
              <Dialog.Close className="btn btn-secondary w-full">{sent ? "Done" : "Later"}</Dialog.Close>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Games are played on devnet; the reward is paid on mainnet to the wallet that played. Both players
              are rewarded once per game, after the result is confirmed on chain.
            </p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
