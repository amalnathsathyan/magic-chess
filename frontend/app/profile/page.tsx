"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Sword,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import {
  api,
  type ApiMatch,
  type ApiPlayerStats,
} from "@/lib/api";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { shortenAddress } from "@/lib/chess";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";
import { cn } from "@/lib/utils";

type PlayerMatch = ApiMatch & { playerColor: string };
type MatchResult = "win" | "loss" | "draw" | "pending";

function normalizedStatus(status: string): string {
  return status.replace(/[_\s-]/g, "").toLowerCase();
}

function getMatchResult(match: PlayerMatch): MatchResult {
  const status = normalizedStatus(match.gameStatus);
  if (status === "draw") return "draw";
  if (status === "whitewins") {
    return match.playerColor.toLowerCase() === "white" ? "win" : "loss";
  }
  if (status === "blackwins") {
    return match.playerColor.toLowerCase() === "black" ? "win" : "loss";
  }
  return "pending";
}

function isTerminalStatus(status: string): boolean {
  return ["whitewins", "blackwins", "draw", "aborted"].includes(
    normalizedStatus(status)
  );
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading player profile">
      {/* Profile header skeleton */}
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="glass-card h-16 animate-pulse" />
      </div>
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-card h-32 animate-pulse" />
        ))}
      </div>
      {/* Match history skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-card h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { ready, authenticated, login } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const walletAddress = selectSolanaWallet(wallets)?.address ?? null;
  const [stats, setStats] = useState<ApiPlayerStats | null>(null);
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);
    try {
      const [statsResponse, matchesResponse] = await Promise.all([
        api.getPlayerStats(walletAddress),
        api.getPlayerMatches(walletAddress, { page: 1, limit: 20 }),
      ]);
      setStats(statsResponse);
      setMatches(matchesResponse.matches);
    } catch {
      setError("We couldn't load this wallet's player activity.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      void loadProfile();
    } else {
      setStats(null);
      setMatches([]);
      setError(null);
    }
  }, [authenticated, walletAddress, loadProfile]);

  const [copied, setCopied] = useState(false);

  const handleCopyAddress = useCallback(async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy address");
    }
  }, [walletAddress]);

  const authLoading = !ready || !walletsReady;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/arena"
        className="mb-6 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Arena
      </Link>

      {authLoading ? (
        <ProfileSkeleton />
      ) : !authenticated ? (
        <div className="glass-card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <User className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-bold">Sign in to view your profile</h1>
            <p className="text-sm text-muted-foreground">
              Your profile is linked to your authenticated Solana wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={login}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in
          </button>
        </div>
      ) : !walletAddress ? (
        <div className="glass-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-amber-400" aria-hidden="true" />
          <h1 className="font-heading text-xl font-semibold">Solana wallet unavailable</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your account is signed in, but no Solana wallet is available yet. Reopen the wallet menu and connect or create one.
          </p>
        </div>
      ) : loading && !stats ? (
        <ProfileSkeleton />
      ) : error ? (
        <div className="glass-card flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            <h1 className="font-heading text-lg font-semibold">Profile unavailable</h1>
          </div>
          <p className="text-sm text-muted-foreground">{error} Try again in a moment.</p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : stats ? (
        <>
          {/* ── A. Profile header with wallet address ── */}
          <div className="mb-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <User className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-heading text-2xl font-bold">Profile</h1>
                {stats.lastGameAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last match {formatMatchDate(stats.lastGameAt)}
                  </p>
                ) : null}
              </div>
              <Link
                href="/arena"
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Sword className="h-4 w-4" aria-hidden="true" />
                Play now
              </Link>
            </div>

            {/* Wallet address with copy */}
            <div className="glass-card flex items-center gap-3 rounded-xl p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <span className="min-w-0 flex-1 break-all font-mono text-sm font-medium">
                {walletAddress}
              </span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={copied ? "Address copied" : "Copy wallet address"}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* ── Empty state for new players ── */}
          {stats.totalGames === 0 ? (
            <div className="glass-card flex flex-col items-center gap-4 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-muted-foreground/20 bg-muted/30">
                <Sword className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-heading text-lg font-semibold">No games played yet</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Head to the arena to create or join your first match. Your stats and history will appear here.
                </p>
              </div>
              <Link
                href="/arena"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Sword className="h-4 w-4" aria-hidden="true" />
                Enter the arena
              </Link>
            </div>
          ) : (
            <>
              {/* ── B. Stats summary cards ── */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Games Played */}
                <div className="glass-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Sword className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-heading text-sm font-semibold">Games Played</span>
                  </div>
                  <p className="font-mono text-3xl font-bold tabular-nums">
                    {stats.totalGames}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <span className="font-semibold">{stats.wins}</span>W
                    </span>
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <span className="font-semibold">{stats.losses}</span>L
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <span className="font-semibold">{stats.draws}</span>D
                    </span>
                  </div>
                </div>

                {/* Win Rate */}
                <div className="glass-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-heading text-sm font-semibold">Win Rate</span>
                  </div>
                  <p
                    className={cn(
                      "font-mono text-3xl font-bold tabular-nums",
                      stats.winRate >= 0.5 ? "text-emerald-400" : "text-destructive"
                    )}
                  >
                    {Math.round(stats.winRate * 100)}%
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {stats.wins}W &middot; {stats.losses}L &middot; {stats.draws}D
                  </p>
                </div>

                {/* Total Wagered / Won */}
                <div className="glass-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-heading text-sm font-semibold">
                      {solanaConfig.wagerSymbol}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-xs text-muted-foreground">Wagered</span>
                      <p className="font-mono text-lg font-bold tabular-nums">
                        {formatTokenAmount(stats.totalWagered)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Won</span>
                      <p
                        className={cn(
                          "font-mono text-lg font-bold tabular-nums",
                          BigInt(stats.totalWon) > 0n ? "text-emerald-400" : "text-muted-foreground"
                        )}
                      >
                        {formatTokenAmount(stats.totalWon)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Streak pill badges */}
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  Current streak: {stats.currentStreak}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  Best streak: {stats.longestWinStreak}
                </span>
              </div>

              {/* ── C. Match history ── */}
              <section aria-labelledby="match-history-heading">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id="match-history-heading" className="font-heading text-lg font-semibold">
                    Match history
                  </h2>
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Updating
                    </span>
                  ) : null}
                </div>

                {matches.length === 0 ? (
                  <div className="glass-card flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <Sword className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No matches yet</p>
                      <p className="text-xs text-muted-foreground">
                        Create or join a match to start building your history.
                      </p>
                    </div>
                    <Link
                      href="/arena"
                      className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Enter the arena
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matches.map((match) => {
                      const result = getMatchResult(match);
                      const opponent =
                        match.playerColor.toLowerCase() === "white"
                          ? match.blackPlayer
                          : match.whitePlayer;
                      const terminal = isTerminalStatus(match.gameStatus);
                      const matchHref = `/play/${encodeURIComponent(match.matchId)}`;

                      return (
                        <div
                          key={match.matchId}
                          className={cn(
                            "glass-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between",
                            result === "win" && "border-l-2 border-l-emerald-500/60",
                            result === "loss" && "border-l-2 border-l-destructive/60",
                            result === "draw" && "border-l-2 border-l-amber-500/60"
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold",
                                result === "win" &&
                                  "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
                                result === "loss" &&
                                  "border-destructive/20 bg-destructive/10 text-destructive",
                                result === "draw" &&
                                  "border-amber-500/20 bg-amber-500/10 text-amber-400",
                                result === "pending" &&
                                  "border-border bg-muted text-muted-foreground"
                              )}
                              aria-label={`Result: ${result}`}
                            >
                              {result === "win"
                                ? "W"
                                : result === "loss"
                                  ? "L"
                                  : result === "draw"
                                    ? "D"
                                    : "…"}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm font-medium">
                                vs {opponent ? shortenAddress(opponent) : "Waiting for opponent"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatMatchDate(match.createdAt)} · {match.moveCount} moves
                              </p>
                              <Link
                                href={matchHref}
                                className="mt-1 inline-block font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                                title={match.matchId}
                              >
                                {shortenAddress(match.matchId, 6)}
                              </Link>
                            </div>
                          </div>
                          <Link
                            href={matchHref}
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            {terminal ? "Spectate" : "Open match"}
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
