"use client";

import { useAppLogin } from "@/hooks/useAppLogin";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  CheckCircle2,
  Coins,
  Lock,
  LoaderCircle,
  Search,
  Sparkles,
  Trophy,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { usePredictionSession } from "@/hooks/usePredictionSession";
import { useMovePredictions } from "@/hooks/useMovePredictions";
import {
  impliedMultiplier,
  type MarketSnapshot,
  type MyBet,
  type PlyMarket,
  type SettledEvent,
} from "@/lib/predictions";
import { plyLabel } from "@/lib/match-board";
import { cn } from "@/lib/utils";

const STAKES = [10, 25, 50, 100, 250] as const;
const PLY_TABS = 5;
const SAN_HINT = /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|(?:[a-h]x)?[a-h][1-8](?:=[QRBN])?)[+#]?$/;

interface PredictionPanelProps {
  matchId: string;
  /** Current authoritative position (for legal next moves). */
  fen: string | null;
  /** Half-moves played on chain. */
  pliesPlayed: number;
  isActive: boolean;
  isFinished: boolean;
  /** Set when the viewer is a player in this match (read-only view). */
  playerColor: "white" | "black" | null;
  liveMarket: MarketSnapshot | null;
  liveSettled: { sequence: number; data: SettledEvent } | null;
  /** Preview a candidate next move on the board. */
  onPreview?: (move: { from: Square; to: Square } | null) => void;
  className?: string;
}

function normalize(san: string): string {
  return san.trim().replace(/0/g, "O").replace(/[+#!?]+$/, "");
}

function statusBadge(bet: MyBet, locked: boolean) {
  switch (bet.status) {
    case "won":
      return (
        <span className="inline-flex items-center gap-1 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />+{bet.payout}
        </span>
      );
    case "lost":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Lost
        </span>
      );
    case "refunded":
      return <span className="text-muted-foreground">Refunded</span>;
    default:
      return locked ? (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Settling
        </span>
      ) : (
        <span className="text-primary">Open</span>
      );
  }
}

export function PredictionPanel({
  matchId,
  fen,
  pliesPlayed,
  isActive,
  isFinished,
  playerColor,
  liveMarket,
  liveSettled,
  onPreview,
  className,
}: PredictionPanelProps) {
  const { authenticated } = usePrivy();
  const login = useAppLogin();
  const session = usePredictionSession();
  const { market, myBets, error, submitting, place, cancel } = useMovePredictions({
    matchId,
    token: session.token,
    address: session.address,
    liveMarket,
    liveSettled,
    onAccount: session.setAccount,
  });

  const nextPly = pliesPlayed + 1;
  const [selectedPly, setSelectedPly] = useState(nextPly);
  const [pick, setPick] = useState("");
  const [stake, setStake] = useState<number>(25);
  const [query, setQuery] = useState("");

  // A confirmed move locks its market: move the selection forward.
  useEffect(() => {
    if (selectedPly > pliesPlayed) return;
    if (pick) toast.info("That move was just played — its predictions are locked.");
    setPick("");
    setSelectedPly(pliesPlayed + 1);
  }, [pick, pliesPlayed, selectedPly]);

  const marketsByPly = useMemo(
    () => new Map((market?.markets ?? []).map((m) => [m.ply, m])),
    [market]
  );
  const selectedMarket: PlyMarket | undefined = marketsByPly.get(selectedPly);

  const legalMoves = useMemo(() => {
    if (!fen || selectedPly !== nextPly) return [];
    try {
      return new Chess(fen).moves({ verbose: true }).map((move) => ({
        san: normalize(move.san),
        from: move.from as Square,
        to: move.to as Square,
      }));
    } catch {
      return [];
    }
  }, [fen, nextPly, selectedPly]);

  const filteredLegal = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? legalMoves.filter((m) => m.san.toLowerCase().includes(q)) : legalMoves).slice(0, 40);
  }, [legalMoves, query]);

  const myBetForPly = myBets.find((bet) => bet.ply === selectedPly);
  const normalizedPick = normalize(pick);
  const pickValid =
    selectedPly === nextPly && legalMoves.length > 0
      ? legalMoves.some((m) => m.san === normalizedPick)
      : SAN_HINT.test(normalizedPick);
  const multiplier = impliedMultiplier(selectedMarket, normalizedPick, stake);
  const balance = session.account?.balance ?? null;

  useEffect(() => {
    if (!onPreview) return;
    const legal = legalMoves.find((m) => m.san === normalizedPick);
    onPreview(legal ? { from: legal.from, to: legal.to } : null);
  }, [legalMoves, normalizedPick, onPreview]);

  const choose = (san: string) => setPick(san);

  const submit = async () => {
    if (!session.token) {
      try {
        await session.signIn();
      } catch (cause) {
        toast.error("Sign-in cancelled", {
          description: cause instanceof Error ? cause.message : undefined,
        });
      }
      return;
    }
    try {
      await place({ ply: selectedPly, san: normalizedPick, stake });
      toast.success(`Predicted ${normalizedPick} for ${plyLabel(selectedPly)}`, {
        description: `${stake} points staked`,
      });
      setPick("");
    } catch (cause) {
      toast.error("Prediction not placed", {
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
  };

  const recentResults = (market?.markets ?? [])
    .filter((m) => m.status !== "open" && m.ply <= pliesPlayed)
    .slice(-4)
    .reverse();

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-heading text-sm font-semibold">Predict the moves</h2>
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
            LIVE
          </span>
        ) : null}
      </div>
      {balance !== null ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 font-mono text-xs"
          title="Play points — no real money"
        >
          <Coins className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          {balance.toLocaleString()} pts
        </span>
      ) : null}
    </div>
  );

  if (playerColor) {
    const nextPool = marketsByPly.get(nextPly)?.pool ?? 0;
    const totalOpen = (market?.markets ?? [])
      .filter((m) => m.ply > pliesPlayed)
      .reduce((sum, m) => sum + m.pool, 0);
    return (
      <section className={cn("glass-card p-4", className)} aria-label="Move predictions">
        {header}
        <p className="mt-3 text-sm text-muted-foreground">
          {totalOpen > 0
            ? `Spectators have ${totalOpen.toLocaleString()} points riding on upcoming moves (${nextPool.toLocaleString()} on the next one).`
            : "Spectators can predict your upcoming moves with play points."}{" "}
          Players can&apos;t predict their own game.
        </p>
      </section>
    );
  }

  if (!isActive) {
    return (
      <section className={cn("glass-card p-4", className)} aria-label="Move predictions">
        {header}
        <p className="mt-3 text-sm text-muted-foreground">
          {isFinished
            ? "This game is over. Open predictions were settled or refunded."
            : "Predictions open as soon as both players are in."}
        </p>
        <MyPredictions bets={myBets} pliesPlayed={pliesPlayed} onCancel={cancel} busy={submitting} />
      </section>
    );
  }

  return (
    <section className={cn("glass-card p-4", className)} aria-label="Move predictions">
      {header}
      <p className="mt-1 text-xs text-muted-foreground">
        Call the next move — or one further ahead. Predictions lock the instant the move
        confirms on-chain. Play points only.
      </p>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      {/* Ply selector */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Move to predict">
        {Array.from({ length: PLY_TABS }, (_, index) => nextPly + index).map((ply) => {
          const pool = marketsByPly.get(ply)?.pool ?? 0;
          const mine = myBets.some((bet) => bet.ply === ply && bet.status === "open");
          return (
            <button
              key={ply}
              type="button"
              role="tab"
              aria-selected={selectedPly === ply}
              onClick={() => {
                setSelectedPly(ply);
                setPick("");
                setQuery("");
              }}
              className={cn(
                "min-w-[5.5rem] shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                selectedPly === ply
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-card"
              )}
            >
              <span className="block font-semibold">
                {ply === nextPly ? "Next" : `+${ply - pliesPlayed}`}
                {mine ? <span className="ml-1 text-primary">●</span> : null}
              </span>
              <span className="block font-mono text-[11px]">{plyLabel(ply)}</span>
              <span className="block font-mono text-[11px] text-amber-300/80">{pool} pts</span>
            </button>
          );
        })}
      </div>

      {/* Crowd picks */}
      {selectedMarket && selectedMarket.options.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Crowd picks · {selectedMarket.bettors} predictions · {selectedMarket.pool} pts
          </p>
          <ul className="space-y-1">
            {selectedMarket.options.slice(0, 5).map((option) => {
              const share = selectedMarket.pool > 0 ? option.stake / selectedMarket.pool : 0;
              return (
                <li key={option.san}>
                  <button
                    type="button"
                    onClick={() => choose(option.san)}
                    className={cn(
                      "relative flex w-full items-center justify-between overflow-hidden rounded-md border px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                      normalizedPick === option.san
                        ? "border-primary/50"
                        : "border-border hover:border-border-hover"
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${Math.round(share * 100)}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative font-mono font-semibold">{option.san}</span>
                    <span className="relative text-muted-foreground">
                      {Math.round(share * 100)}% · ×{impliedMultiplier(selectedMarket, option.san, 0).toFixed(1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {myBetForPly ? (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Your pick: <strong className="font-mono">{myBetForPly.predictedSan}</strong> ·{" "}
            {myBetForPly.stake} pts
          </span>
          {myBetForPly.status === "open" ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                void cancel(selectedPly).catch((cause) =>
                  toast.error(cause instanceof Error ? cause.message : "Couldn't cancel")
                )
              }
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Change
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* Move picker */}
          <div className="mt-3">
            {selectedPly === nextPly && legalMoves.length > 0 ? (
              <>
                <label className="relative block">
                  <span className="sr-only">Filter legal moves</span>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Filter ${legalMoves.length} legal moves`}
                    className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
                <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {filteredLegal.map((move) => (
                    <button
                      key={move.san}
                      type="button"
                      onClick={() => choose(move.san)}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                        normalizedPick === move.san
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border hover:bg-card"
                      )}
                    >
                      {move.san}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Your prediction for {plyLabel(selectedPly)} (e.g. Nf3, exd5, O-O)
                </span>
                <input
                  value={pick}
                  onChange={(event) => setPick(event.target.value)}
                  placeholder="Nf3"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={pick.length > 0 && !pickValid}
                  className={cn(
                    "h-9 w-full rounded-md border bg-card px-2.5 font-mono text-sm focus-visible:ring-2 focus-visible:ring-primary",
                    pick.length > 0 && !pickValid ? "border-destructive/60" : "border-border"
                  )}
                />
              </label>
            )}
          </div>

          {/* Stake */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Stake">
            {STAKES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStake(value)}
                aria-pressed={stake === value}
                disabled={balance !== null && value > balance}
                className={cn(
                  "min-w-12 rounded-md border px-2 py-1 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40",
                  stake === value
                    ? "border-amber-300/60 bg-amber-300/10 text-amber-200"
                    : "border-border hover:bg-card"
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={
              submitting ||
              session.signingIn ||
              (Boolean(session.token) && (!pickValid || (balance !== null && stake > balance)))
            }
            onClick={() => (authenticated ? void submit() : login())}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting || session.signingIn ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {!authenticated
              ? "Sign in to predict"
              : !session.token
                ? "Start predicting (free signature)"
                : pickValid
                  ? `Predict ${normalizedPick} · ${stake} pts · win ≈${Math.floor(stake * multiplier)}`
                  : "Pick a move"}
          </button>
        </>
      )}

      <MyPredictions bets={myBets} pliesPlayed={pliesPlayed} onCancel={cancel} busy={submitting} />

      {recentResults.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            Recent results
          </p>
          <ul className="space-y-1 text-xs">
            {recentResults.map((result) => (
              <li key={result.ply} className="flex justify-between">
                <span className="font-mono text-muted-foreground">{plyLabel(result.ply)}</span>
                <span className="font-mono">
                  {result.status === "void" ? "void" : result.actualSan ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function MyPredictions({
  bets,
  pliesPlayed,
  onCancel,
  busy,
}: {
  bets: MyBet[];
  pliesPlayed: number;
  onCancel: (ply: number) => Promise<void>;
  busy: boolean;
}) {
  if (bets.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Your predictions</p>
      <ul className="space-y-1 text-xs">
        {bets.slice(0, 8).map((bet) => {
          const locked = bet.ply <= pliesPlayed;
          return (
            <li key={bet.ply} className="flex items-center justify-between gap-2">
              <span className="font-mono">
                {plyLabel(bet.ply)} · {bet.predictedSan} · {bet.stake}
              </span>
              <span className="flex items-center gap-2">
                {statusBadge(bet, locked)}
                {bet.status === "open" && !locked ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onCancel(bet.ply).catch((cause) =>
                        toast.error(cause instanceof Error ? cause.message : "Couldn't cancel")
                      )
                    }
                    className="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Cancel prediction for ${plyLabel(bet.ply)}`}
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
