"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sword, Coins, Clock, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivy, useWallets } from "@privy-io/react-auth";
// @ts-ignore
import { useMagicChessClient } from "@magic-chess/sdk/react";
// @ts-ignore
import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CreateMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: CreateMatchData) => void;
  className?: string;
}

export interface CreateMatchData {
  wagerAmount: number;
  wagerToken: string;
  timeControlMinutes: number;
  timeIncrementSeconds: number;
  rated: boolean;
  side: "white" | "black" | "random";
  ephemeralRollup: boolean;
}

const TIME_CONTROLS = [
  { label: "Bullet 1+0", minutes: 1, increment: 0 },
  { label: "Blitz 3+2", minutes: 3, increment: 2 },
  { label: "Rapid 10+0", minutes: 10, increment: 0 },
];

export function CreateMatchForm({
  isOpen,
  onClose,
  onSubmit,
  className,
}: CreateMatchFormProps) {
  const [wagerAmount, setWagerAmount] = useState(0);
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[1]);
  const [side, setSide] = useState<"white" | "black" | "random">("random");
  const [ephemeralRollup, setEphemeralRollup] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();

  // Try to get the client from context
  let client: any = null;
  try {
    client = useMagicChessClient();
  } catch (e) {
    // If provider is missing, we gracefully fallback
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authenticated) {
      // Allow local demo match if not connected
      if (wagerAmount === 0) {
        toast.success("Starting local demo match...");
        router.push(`/play/demo-${Date.now()}`);
        onClose();
        return;
      }
      
      login();
      return;
    }

    const data = {
      wagerAmount,
      wagerToken: "SOL",
      timeControlMinutes: timeControl.minutes,
      timeIncrementSeconds: timeControl.increment,
      rated: true,
      side,
      ephemeralRollup,
    };

    onSubmit?.(data);

    if (client) {
      try {
        setIsSubmitting(true);
        const matchId = `match_${Date.now()}`;
        const wallet = wallets[0];
        
        // Dummy values since we don't have the real context for tokens in the form yet
        const dummyPubkey = new PublicKey("11111111111111111111111111111111");
        const playerTokenAccount = wallet?.address ? new PublicKey(wallet.address) : dummyPubkey;

        const { match } = await client.createMatch({
          matchId,
          betAmount: wagerAmount * 1e9,
          moveTimeoutDuration: timeControl.minutes * 60,
          platformFeeBasisPoints: 100,
          platformFeeWallet: dummyPubkey,
          bettingTokenMint: dummyPubkey,
          playerTokenAccount: playerTokenAccount,
        });
        
        toast.success("Match created on-chain!");
        router.push(`/play/${match}`);
        onClose();
      } catch (err) {
        console.error(err);
        toast.error("Failed to create match");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Fallback for demo
      toast.success("Creating demo match (No Provider)");
      router.push(`/play/demo-${Date.now()}`);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn("glass-card w-full max-w-md p-6 shadow-card", className)}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">Create Match</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Coins className="h-4 w-4" />
                  Wager Amount (SOL)
                </label>
                <input
                  type="number"
                  value={wagerAmount}
                  onChange={(e) => setWagerAmount(Number(e.target.value))}
                  min={0}
                  step={0.01}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Time Control
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.label}
                      type="button"
                      onClick={() => setTimeControl(tc)}
                      className={cn(
                        "rounded-lg border border-border px-3 py-2 text-xs font-mono transition-all",
                        timeControl.label === tc.label
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "hover:border-border-hover hover:bg-card"
                      )}
                    >
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  Play As
                </label>
                <div className="flex gap-2">
                  {(["random", "white", "black"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={cn(
                        "flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold capitalize transition-all",
                        side === s
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "hover:border-border-hover hover:bg-card"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Ephemeral Rollup</span>
                  <span className="text-xs text-muted-foreground">Zero gas fees during gameplay</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEphemeralRollup(!ephemeralRollup)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20",
                    ephemeralRollup ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      ephemeralRollup ? "translate-x-4" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-glow disabled:opacity-50"
              >
                {!authenticated ? (
                  <>
                    {wagerAmount === 0 ? <Sword className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                    {wagerAmount === 0 ? "Create Local Demo" : "Login to Create"}
                  </>
                ) : (
                  <>
                    <Sword className="h-4 w-4" />
                    {isSubmitting ? "Creating..." : "Create Match"}
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
