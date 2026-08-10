"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { Check, ChevronDown, Clock, Coins, Plus, Sword, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { findChessMatchPda, findMatchEscrowPda } from "@magic-chess/sdk";
import { cn } from "@/lib/utils";
import {
  getBackendFeePayer,
  getPlatformFeeWallet,
  parseTokenAmount,
  solanaConfig,
  WRAPPED_SOL_MINT,
} from "@/lib/solana-config";
import { getTransactionPayer } from "@/lib/wager";
import { selectSolanaWallet } from "@/lib/privy-wallet";

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

// Known betting tokens on devnet. Add more as needed.
const BETTING_TOKENS = [
  {
    label: "WSOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    symbol: "WSOL",
  },
  {
    label: "MAGIC (test)",
    mint: "EvhpnrnGEggWfi7whd6TH87bcZZLWJtUAPjmBAFNwDQy",
    decimals: 9,
    symbol: "MAGIC",
  },
] as const;

const CUSTOM_TOKEN = { label: "Custom", mint: "", decimals: 9, symbol: "" } as const;

export function CreateMatchForm({
  isOpen,
  onClose,
  className,
}: CreateMatchFormProps) {
  const [wagerAmount, setWagerAmount] = useState("0");
  const [timeControl, setTimeControl] = useState<
    (typeof TIME_CONTROLS)[number]
  >(TIME_CONTROLS[1]);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [customMint, setCustomMint] = useState("");
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const client = useMagicChessClient();
  const router = useRouter();

  const isCustom = selectedTokenIndex === BETTING_TOKENS.length;
  const selectedToken = isCustom
    ? { ...CUSTOM_TOKEN, mint: customMint }
    : BETTING_TOKENS[selectedTokenIndex];
  const isFree = wagerAmount === "0" || wagerAmount === "";

  const resolveMint = (): PublicKey => {
    if (isCustom) {
      if (!customMint) throw new Error("Enter a token mint address.");
      return new PublicKey(customMint);
    }
    return new PublicKey(selectedToken.mint);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!authenticated) {
      login();
      return;
    }

    const wallet = selectSolanaWallet(wallets);
    if (!wallet) {
      toast.error("Your Solana wallet is still being prepared. Try again shortly.");
      return;
    }

    setIsSubmitting(true);
    try {
      const mint = resolveMint();
      const decimals = selectedToken.decimals;
      const rawWager = parseTokenAmount(wagerAmount || "0", decimals);
      const player = new PublicKey(wallet.address);
      const platformFeeWallet = getPlatformFeeWallet();
      const matchId = `mc-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

      // Build a single transaction: [ATA idempotent create] + [initialize_match]
      const provider = client.program.provider;
      const transaction = new Transaction();
      const payer = getTransactionPayer(client, player);
      const playerTokenAccount = getAssociatedTokenAddressSync(mint, player);

      // 1. Idempotent ATA creation (so the escrow can transfer tokens)
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer,
          playerTokenAccount,
          player,
          mint
        )
      );

      // 2. Build initialize_match instruction
      const [chessMatchPda] = findChessMatchPda(matchId, client.programId);
      const [matchEscrowPda] = findMatchEscrowPda(matchId, client.programId);
      const initIx = await client.program.methods
        .initializeMatch(
          matchId,
          rawWager,
          BigInt(timeControl.minutes * 60),
          solanaConfig.platformFeeBps,
          platformFeeWallet,
          false // predictionEnabled
        )
        .accountsPartial({
          chessMatch: chessMatchPda,
          playerSigner: player,
          rentPayer: payer,
          bettingTokenMintAccount: mint,
          playerTokenAccount,
          matchEscrowTokenAccount: matchEscrowPda,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      transaction.add(initIx);
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash("confirmed")
      ).blockhash;
      transaction.feePayer = payer;

      const signature = await provider.sendAndConfirm(transaction);

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
            {/* ── Token selector ── */}
            <div className="relative">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Coins className="h-4 w-4" aria-hidden="true" />
                Betting token
              </label>
              <button
                type="button"
                onClick={() => setTokenDropdownOpen((prev) => !prev)}
                className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className={cn(isCustom && !customMint && "text-muted-foreground")}>
                  {isCustom && customMint
                    ? `${customMint.slice(0, 6)}…${customMint.slice(-4)}`
                    : selectedToken.label}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", tokenDropdownOpen && "rotate-180")} />
              </button>
              {tokenDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-card p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {BETTING_TOKENS.map((token, index) => (
                    <button
                      key={token.mint}
                      type="button"
                      onClick={() => {
                        setSelectedTokenIndex(index);
                        setTokenDropdownOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        selectedTokenIndex === index
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-white/5"
                      )}
                    >
                      <span className="flex-1 text-left">{token.label}</span>
                      <span className="text-xs text-muted-foreground">{token.symbol}</span>
                      {selectedTokenIndex === index && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTokenIndex(BETTING_TOKENS.length);
                      setTokenDropdownOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      isCustom ? "bg-primary/10 text-primary" : "hover:bg-white/5"
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Custom token
                    {isCustom && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                </div>
              )}
            </div>

            {/* ── Custom mint input ── */}
            {isCustom && (
              <div>
                <label
                  htmlFor="custom-mint"
                  className="mb-2 flex items-center gap-2 text-sm font-medium"
                >
                  Token mint address
                </label>
                <input
                  id="custom-mint"
                  type="text"
                  value={customMint}
                  onChange={(event) => setCustomMint(event.target.value)}
                  placeholder="Enter SPL token mint address…"
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-border bg-card px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            )}

            {/* ── Wager ── */}
            <div>
              <label
                htmlFor="wager-amount"
                className="mb-2 flex items-center gap-2 text-sm font-medium"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                Wager ({isCustom ? "tokens" : selectedToken.symbol})
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
              <p className="mt-2 text-xs text-muted-foreground">
                Use <button type="button" onClick={() => setWagerAmount("0")} className="underline hover:text-foreground">0</button> for a free match.
                {selectedToken.mint === WRAPPED_SOL_MINT.toBase58()
                  ? " Sponsorship covers network fees and account rent, not the wager."
                  : ""}
              </p>
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
