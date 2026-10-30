"use client";

import { useAppLogin } from "@/hooks/useAppLogin";
import { playHref } from "@/lib/match-links";
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PublicKey } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { Check, ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import {
  MAX_SCHEDULE_AHEAD_SECONDS,
  OPEN_MATCH_WINDOW_SECONDS,
  buildMatchId,
} from "@magic-chess/sdk";
import { formatStartTime } from "@/lib/match-start";
import { useMagicSession } from "@/components/shared/MagicSessionProvider";
import { cn } from "@/lib/utils";
import {
  getPlatformFeeWallet,
  parseTokenAmount,
  solanaConfig,
} from "@/lib/solana-config";
import { buildWagerInstruction, getTransactionPayer } from "@/lib/wager";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { useTokenBalances, type TokenBalance } from "@/lib/token-balances";
import { DEFAULT_STAKE_TOKEN, findStakeToken, STAKE_TOKENS } from "@/lib/stake-tokens";
import { FaucetBanner } from "@/components/lobby/FaucetBanner";
import { syncMatchCreated } from "@/lib/sync";
import { solanaDevnetTxUrl } from "@/lib/explorer";

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

type StartOption = "now" | "in10" | "custom";

const START_OPTIONS: { value: StartOption; label: string; hint: string }[] = [
  { value: "now", label: "Now", hint: "Open right away" },
  { value: "in10", label: "In 10 min", hint: "Time to send the link" },
  { value: "custom", label: "Pick a time", hint: "Date and time" },
];

/** The earliest a scheduled start can be, so the creator has time to share. */
const MIN_SCHEDULE_AHEAD_MS = 2 * 60_000;

/** `datetime-local` wants "YYYY-MM-DDTHH:MM" in the device's local time. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * When the match starts, in Unix seconds, or null for "now". Throws when the
 * custom time is missing, in the past or more than 30 days ahead.
 */
export function resolveStartsAt(option: StartOption, customValue: string, nowMs = Date.now()): number | null {
  if (option === "now") return null;
  if (option === "in10") return Math.floor(nowMs / 1000) + 10 * 60;
  const parsed = customValue ? new Date(customValue).getTime() : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error("Pick a start date and time.");
  if (parsed < nowMs + MIN_SCHEDULE_AHEAD_MS) {
    throw new Error("Pick a start time at least 2 minutes from now.");
  }
  if (parsed > nowMs + MAX_SCHEDULE_AHEAD_SECONDS * 1000) {
    throw new Error("Pick a start time within the next 30 days.");
  }
  return Math.floor(parsed / 1000);
}

export function CreateMatchForm({
  isOpen,
  onClose,
  className,
}: CreateMatchFormProps) {
  const [wagerAmount, setWagerAmount] = useState("0");
  const [timeControl, setTimeControl] = useState<
    (typeof TIME_CONTROLS)[number]
  >(TIME_CONTROLS[1]);
  const [startOption, setStartOption] = useState<StartOption>("now");
  const [customStart, setCustomStart] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 60 * 60_000))
  );
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [customMint, setCustomMint] = useState("");
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authenticated } = usePrivy();
  const login = useAppLogin();
  const { wallets } = useWallets();
  const client = useMagicChessClient();
  const { prepareMatchSession } = useMagicSession();
  const router = useRouter();

  const wallet = selectSolanaWallet(wallets);
  const { balances, loading: balancesLoading } = useTokenBalances(wallet?.address);

  // The app's stake tokens come first (on devnet: the ZUG play token, then
  // SOL), each with the wallet's balance, then any other token the wallet
  // holds, then a custom mint.
  const tokenList = useMemo(() => {
    const held = new Map(balances.map((b) => [b.mint, b]));
    const list: TokenBalance[] = STAKE_TOKENS.map((token) => ({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      amount: held.get(token.mint)?.amount ?? 0n,
      uiAmount: held.get(token.mint)?.uiAmount ?? 0,
    }));
    const seen = new Set(list.map((token) => token.mint));
    for (const b of balances) {
      if (!seen.has(b.mint)) {
        seen.add(b.mint);
        list.push(b);
      }
    }
    return list;
  }, [balances]);

  const isCustom = selectedTokenIndex === tokenList.length;
  const selectedToken = isCustom
    ? { mint: customMint, symbol: "", decimals: 9, uiAmount: 0, amount: 0n }
    : (tokenList[selectedTokenIndex] ?? tokenList[0]);
  const stakePresets = findStakeToken(selectedToken.mint)?.presets ?? DEFAULT_STAKE_TOKEN.presets;
  const isFree = wagerAmount === "0" || wagerAmount === "";
  const isDefaultToken = selectedToken.mint === DEFAULT_STAKE_TOKEN.mint;
  const stakeShort = (() => {
    if (isCustom || isFree) return false;
    try {
      return parseTokenAmount(wagerAmount, selectedToken.decimals) > selectedToken.amount;
    } catch {
      return false;
    }
  })();

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
      // The start time rides in the match id, so every reader of the chain
      // (lobby, play page, backend) sees it without a program change.
      const startsAt = resolveStartsAt(startOption, customStart);
      const matchId = buildMatchId({ startsAt });

      // Wager ATA + SOL wrapping ride in the same transaction: one approval.
      const wagerPrep = await buildWagerInstruction(client, player, mint, rawWager, {
        symbol: isCustom ? null : selectedToken.symbol,
        decimals,
      });
      // White's instant-move key is registered by the same transaction, so
      // there's no separate approval once the game starts.
      const fastPlay = await prepareMatchSession(matchId);

      const { signature } = await client.createMatch({
        matchId,
        betAmount: rawWager,
        moveTimeoutDuration: BigInt(timeControl.minutes * 60),
        platformFeeBasisPoints: solanaConfig.platformFeeBps,
        platformFeeWallet,
        bettingTokenMint: mint,
        playerTokenAccount: wagerPrep.tokenAccount,
        preInstructions: wagerPrep.instructions,
        postInstructions: fastPlay.instructions,
        signers: fastPlay.signers,
        rentPayer: getTransactionPayer(client, player),
        predictionEnabled: false,
      });

      fastPlay.save();
      void syncMatchCreated({ matchId, signature });

      toast.success(
        startsAt === null
          ? "Match created on Solana"
          : `Match created. It opens ${formatStartTime(startsAt, Date.now())}.`,
        {
        description: (
          <a
            href={solanaDevnetTxUrl(signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary-hover"
          >
            {signature.slice(0, 8)}…{signature.slice(-8)} ↗
          </a>
        ),
        }
      );
      onClose();
      router.push(playHref(matchId));
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
            "panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)] focus:outline-none sm:p-8",
            className
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="font-display text-3xl">
              New match
            </Dialog.Title>
            <Dialog.Close
              className="-mr-2 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-7 text-sm text-muted-foreground">
            You play White. Whoever joins plays Black.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ── Devnet only: free ZUG to stake with ── */}
            <FaucetBanner
              walletAddress={wallet?.address}
              variant="card"
              onlyWhenClaimable
              reason={
                stakeShort && isDefaultToken
                  ? `You hold ${selectedToken.uiAmount.toLocaleString("en-US")} ${selectedToken.symbol}. Claim more to stake ${wagerAmount}.`
                  : undefined
              }
            />

            {/* ── Token selector ── */}
            <div className="relative">
              <label className="label mb-2 block">Token</label>
              <button
                type="button"
                onClick={() => setTokenDropdownOpen((prev) => !prev)}
                className="flex h-11 w-full items-center justify-between border border-border bg-background px-3 text-sm transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className={cn(isCustom && !customMint && "text-muted-foreground")}>
                  {isCustom
                    ? customMint
                      ? `${customMint.slice(0, 6)}…${customMint.slice(-4)}`
                      : "Custom token"
                    : selectedToken.symbol}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", tokenDropdownOpen && "rotate-180")} />
              </button>
              {tokenDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto border border-border bg-card p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {balancesLoading && tokenList.length <= 1 && (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      Loading tokens…
                    </div>
                  )}
                  {tokenList.map((token, index) => (
                    <button
                      key={token.mint}
                      type="button"
                      onClick={() => {
                        setSelectedTokenIndex(index);
                        setTokenDropdownOpen(false);
                        // A SOL preset makes no sense in ZUG and the other way round.
                        if (stakePresets.includes(wagerAmount) && token.mint !== selectedToken.mint) {
                          setWagerAmount("0");
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        selectedTokenIndex === index
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-card-hover"
                      )}
                    >
                      <span className="flex-1 text-left">{token.symbol}</span>
                      <span className="text-xs text-muted-foreground tnum">
                        {token.uiAmount > 0
                          ? token.uiAmount < 0.001
                            ? "<0.001"
                            : token.uiAmount >= 100
                              ? Math.floor(token.uiAmount).toLocaleString("en-US")
                              : token.uiAmount.toFixed(token.uiAmount < 1 ? 3 : 1)
                          : findStakeToken(token.mint)
                            ? "0"
                            : ""}
                      </span>
                      {selectedTokenIndex === index && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTokenIndex(tokenList.length);
                      setTokenDropdownOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      isCustom ? "bg-primary/10 text-primary" : "hover:bg-card-hover"
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
                <label htmlFor="custom-mint" className="label mb-2 block">
                  Token mint address
                </label>
                <input
                  id="custom-mint"
                  type="text"
                  value={customMint}
                  onChange={(event) => setCustomMint(event.target.value)}
                  placeholder="SPL token mint address…"
                  autoComplete="off"
                  className="h-11 w-full border border-border bg-background px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            )}

            {/* ── Wager ── */}
            <div>
              <label htmlFor="wager-amount" className="label mb-2 block">
                Stake per player ({isCustom ? "tokens" : selectedToken.symbol})
              </label>
              <input
                id="wager-amount"
                type="text"
                inputMode="decimal"
                value={wagerAmount}
                onChange={(event) => setWagerAmount(event.target.value)}
                autoComplete="off"
                className="h-12 w-full border border-border bg-background px-3 text-lg font-semibold tnum text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {stakePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setWagerAmount(preset)}
                    aria-pressed={wagerAmount === preset}
                    className={cn(
                      "min-h-9 border text-xs font-semibold tnum transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      wagerAmount === preset
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                    )}
                  >
                    {preset === "0" ? "Free" : preset}
                  </button>
                ))}
              </div>
              {!isCustom ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stakeShort
                    ? `You hold ${selectedToken.uiAmount.toLocaleString("en-US")} ${selectedToken.symbol}. Network fees are on us; the stake is yours.`
                    : "Network fees are on us."}
                </p>
              ) : null}
            </div>

            <fieldset>
              <legend className="label mb-2">Time per move</legend>
              <div className="grid grid-cols-3 gap-2">
                {TIME_CONTROLS.map((control) => (
                  <button
                    key={control.label}
                    type="button"
                    onClick={() => setTimeControl(control)}
                    aria-pressed={timeControl.label === control.label}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      timeControl.label === control.label
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                    )}
                  >
                    <span className="text-sm font-semibold tnum">{control.minutes} min</span>
                    <span className="text-xs text-muted-foreground">{control.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="label mb-2">Starts</legend>
              <div className="grid grid-cols-3 gap-2">
                {START_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStartOption(option.value)}
                    aria-pressed={startOption === option.value}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      startOption === option.value
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                    )}
                  >
                    <span className="text-sm font-semibold">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                ))}
              </div>
              {startOption === "custom" ? (
                <div className="mt-2">
                  <label htmlFor="start-time" className="sr-only">
                    Start date and time
                  </label>
                  <input
                    id="start-time"
                    type="datetime-local"
                    value={customStart}
                    min={toLocalInputValue(new Date(Date.now() + MIN_SCHEDULE_AHEAD_MS))}
                    max={toLocalInputValue(new Date(Date.now() + MAX_SCHEDULE_AHEAD_SECONDS * 1000))}
                    onChange={(event) => setCustomStart(event.target.value)}
                    required
                    className="h-11 w-full border border-border bg-background px-3 text-sm tnum text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {startOption === "now"
                  ? `Anyone can join for the next ${OPEN_MATCH_WINDOW_SECONDS / 60} minutes. Nobody joins? Cancel for a full refund.`
                  : `Your opponent can join from the start time, for ${OPEN_MATCH_WINDOW_SECONDS / 60} minutes. Your stake waits in escrow until then; cancel any time before someone joins.`}
              </p>
            </fieldset>

            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="btn btn-primary min-h-12 w-full"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isSubmitting ? "Creating…" : isFree ? "Create free match" : "Create match"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
