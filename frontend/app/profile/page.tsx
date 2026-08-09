"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CircleDot,
  LoaderCircle,
  LogIn,
  RefreshCw,
  User,
  Sword,
  Trophy,
  TrendingUp,
  Scale,
  ExternalLink,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  api,
  type ApiMatch,
  type ApiPlayerStats,
} from "@/lib/api";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { shortenAddress } from "@/lib/chess";
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
      <div className="glass-card h-36 animate-pulse" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
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

  const statCards = useMemo(
    () =>
      stats
        ? [
            {
              icon: Sword,
              label: "Games",
              value: stats.totalGames,
              color: "text-foreground",
            },
            {
              icon: Trophy,
              label: "Wins",
              value: stats.wins,
              color: "text-emerald-400",
            },
            {
              icon: TrendingUp,
              label: "Losses",
              value: stats.losses,
              color: "text-destructive",
            },
            {
              icon: Scale,
              label: "Draws",
              value: stats.draws,
              color: "text-amber-400",
            },
            {
              icon: CircleDot,
              label: "Win rate",
              value: `${Math.round(stats.winRate * 100)}%`,
              color: "text-primary",
            },
          ]
        : [],
    [stats]
  );

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
          <div className="glass-card mb-8 flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
              <User className="h-10 w-10 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-2xl font-bold">Player profile</h1>
              <p
                className="mt-2 truncate font-mono text-sm text-muted-foreground"
                title={walletAddress}
              >
                {shortenAddress(walletAddress, 6)}
              </p>
              {stats.lastGameAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last match {formatMatchDate(stats.lastGameAt)}
                </p>
              ) : null}
            </div>
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Sword className="h-4 w-4" aria-hidden="true" />
              Play now
            </Link>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {statCards.map((stat) => (
              <div key={stat.label} className="glass-card p-4 text-center">
                <stat.icon
                  className={cn("mx-auto mb-2 h-5 w-5", stat.color)}
                  aria-hidden="true"
                />
                <p className={cn("font-mono text-xl font-bold tabular-nums", stat.color)}>
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

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
                  const href = terminal
                    ? `/play/${encodeURIComponent(match.matchId)}/spectate`
                    : `/play/${encodeURIComponent(match.matchId)}`;

                  return (
                    <div
                      key={match.matchId}
                      className="glass-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
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
                        </div>
                      </div>
                      <Link
                        href={href}
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
      ) : null}
    </div>
  );
}
