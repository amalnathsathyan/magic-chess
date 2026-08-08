"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PublicKey } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Clock, Coins, Sword, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { cn } from "@/lib/utils";
import {
  getPlatformFeeWallet,
  parseTokenAmount,
  solanaConfig,
  WRAPPED_SOL_MINT,
} from "@/lib/solana-config";
import { prepareWagerAccount } from "@/lib/wager";

interface CreateMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const TIME_CONTROLS = [
  { label: "Bullet", minutes: 1 },
  { label: "Blitz", minutes: 3 },
  { label: "Rapid", minutes: 10 },
] as const;

export function CreateMatchForm({
  isOpen,
  onClose,
  className,
}: CreateMatchFormProps) {
  const [wagerAmount, setWagerAmount] = useState("0");
  const [timeControl, setTimeControl] = useState<
    (typeof TIME_CONTROLS)[number]
  >(TIME_CONTROLS[1]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authenticated, login } = usePrivy();
  const { wallets } = useSolanaWallets();
  const client = useMagicChessClient();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!authenticated) {
      login();
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      toast.error("Your Solana wallet is still being prepared. Try again shortly.");
      return;
    }

    setIsSubmitting(true);
    try {
      const rawWager = parseTokenAmount(
        wagerAmount,
        solanaConfig.wagerDecimals
      );
      const player = new PublicKey(wallet.address);
      const mint = new PublicKey(solanaConfig.wagerMint);
      const platformFeeWallet = getPlatformFeeWallet();
      const playerTokenAccount = await prepareWagerAccount(
        client,
        player,
        mint,
        rawWager
      );

      const matchId = `mc-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const { signature } = await client.createMatch({
        matchId,
        betAmount: rawWager,
        moveTimeoutDuration: BigInt(timeControl.minutes * 60),
        platformFeeBasisPoints: solanaConfig.platformFeeBps,
        platformFeeWallet,
        bettingTokenMint: mint,
        playerTokenAccount,
        predictionEnabled: false,
      });

      toast.success("Match created on Solana", {
        description: `${signature.slice(0, 8)}…${signature.slice(-8)}`,
      });
      onClose();
      router.push(`/play/${matchId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create the match.";
      toast.error("Match creation failed", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "glass-card fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6 shadow-card focus:outline-none",
            className
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="font-heading text-lg font-bold">
              Create on-chain match
            </Dialog.Title>
            <Dialog.Close
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close create match dialog"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-5 text-sm text-muted-foreground">
            The creator plays White. The match moves to MagicBlock after an
            opponent joins.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="wager-amount"
                className="mb-2 flex items-center gap-2 text-sm font-medium"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                Wager ({solanaConfig.wagerSymbol})
              </label>
              <input
                id="wager-amount"
                type="text"
                inputMode="decimal"
                value={wagerAmount}
                onChange={(event) => setWagerAmount(event.target.value)}
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
              {solanaConfig.wagerMint === WRAPPED_SOL_MINT.toBase58() && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter 0 for a free match. Paid matches wrap native SOL to WSOL before creation.
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Per-move timeout
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {TIME_CONTROLS.map((control) => (
                  <button
                    key={control.label}
                    type="button"
                    onClick={() => setTimeControl(control)}
                    aria-pressed={timeControl.label === control.label}
                    className={cn(
                      "min-h-10 rounded-lg border px-3 py-2 text-xs font-mono transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                      timeControl.label === control.label
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border hover:bg-card"
                    )}
                  >
                    {control.label} · {control.minutes}m
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sword className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? "Creating on Solana…" : "Review and create"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
