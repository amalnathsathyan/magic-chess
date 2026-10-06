"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Flame,
  LogIn,
  Pencil,
  RefreshCw,
  Sword,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { FinishedGameCard } from "@/components/lobby/FinishedGameCard";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { RatingChart } from "@/components/profile/RatingChart";
import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { useAppLogin } from "@/hooks/useAppLogin";
import {
  api,
  type ApiOutcome,
  type ApiPlayerMatch,
  type ApiPlayerProfile,
  type ApiTally,
} from "@/lib/api";
import { formatEndReason, timeAgo } from "@/lib/game-result";
import { playHref, spectateHref } from "@/lib/match-links";
import { playerLabel } from "@/lib/players";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "win", label: "Wins" },
  { key: "loss", label: "Losses" },
  { key: "draw", label: "Draws" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView />
    </Suspense>
  );
}

function ProfileView() {
  const requested = useSearchParams().get("address");
  const { ready, authenticated } = usePrivy();
  const login = useAppLogin();
  const { ready: walletsReady, wallets } = useWallets();
  const myWallet = selectSolanaWallet(wallets)?.address ?? null;
  const wallet = requested ?? myWallet;
  const isOwnProfile = Boolean(wallet && wallet === myWallet);

  const [profile, setProfile] = useState<ApiPlayerProfile | null>(null);
  const [matches, setMatches] = useState<ApiPlayerMatch[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const [profileResult, matchesResult] = await Promise.allSettled([
        api.getPlayerProfile(wallet),
        api.getPlayerMatches(wallet, {
          limit: 25,
          ...(filter === "all" ? {} : { result: filter as ApiOutcome }),
        }),
      ]);
      if (profileResult.status === "rejected") {
        setError("We couldn't load this player's profile.");
      } else {
        setProfile(profileResult.value);
      }
      setMatches(matchesResult.status === "fulfilled" ? matchesResult.value.matches : []);
    } finally {
      setLoading(false);
    }
  }, [filter, wallet]);

  useEffect(() => {
    if (wallet) void load();
    else {
      setProfile(null);
      setMatches([]);
    }
  }, [load, wallet]);

  const copyAddress = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      toast.success("Address copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Your browser blocked clipboard access.");
    }
  };

  const liveMatches = useMemo(
    () => matches.filter((match) => match.gameStatus === "Active"),
    [matches]
  );
  const finishedMatches = useMemo(
    () => matches.filter((match) => match.gameStatus !== "Active" && match.gameStatus !== "WaitingForOpponent"),
    [matches]
  );

  if (!ready || !walletsReady) return <ProfileShell><ProfileSkeleton /></ProfileShell>;

  if (!wallet) {
    return (
      <ProfileShell>
        <div className="glass-card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Trophy className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-bold">Sign in to see your profile</h1>
            <p className="text-sm text-muted-foreground">
              Your rating, game history and replays live on your wallet.
            </p>
          </div>
          {!authenticated ? (
            <button
              type="button"
              onClick={() => login()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </button>
          ) : null}
        </div>
      </ProfileShell>
    );
  }

  if (loading && !profile) {
    return (
      <ProfileShell>
        <ProfileSkeleton />
      </ProfileShell>
    );
  }

  if (!profile) {
    return (
      <ProfileShell>
        <div className="glass-card flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            <h1 className="font-heading text-lg font-semibold">Profile unavailable</h1>
          </div>
          <p className="text-sm text-muted-foreground">{error ?? "Nothing to show yet."}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </ProfileShell>
    );
  }

  const { stats } = profile;

  return (
    <ProfileShell>
      {/* ── Identity ── */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
        <PlayerAvatar wallet={profile.wallet} avatar={profile.avatar} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">
              {playerLabel(profile.wallet, profile.displayName)}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-sm font-semibold text-primary">
              {profile.rating}
              {profile.provisional ? (
                <span className="text-[11px] font-normal text-primary/70">provisional</span>
              ) : null}
            </span>
            {profile.rank ? (
              <span className="text-xs text-muted-foreground">#{profile.rank} by rating</span>
            ) : null}
          </div>
          {profile.bio ? <p className="mt-2 max-w-xl text-sm">{profile.bio}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="inline-flex items-center gap-1.5 font-mono transition-colors hover:text-foreground"
            >
              {profile.wallet}
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            {profile.memberSince ? <span>Joined {timeAgo(profile.memberSince)}</span> : null}
            {stats.lastGameAt ? <span>Last game {timeAgo(stats.lastGameAt)}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => setEditing((current) => !current)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit profile
              </button>
            ) : null}
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Sword className="h-4 w-4" aria-hidden="true" />
              {isOwnProfile ? "Play now" : "Challenge in the arena"}
            </Link>
          </div>
        </div>
      </header>

      {editing && isOwnProfile ? (
        <div className="mb-6">
          <ProfileEditor
            profile={profile}
            onSaved={setProfile}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : null}

      {/* ── Form and rating ── */}
      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_280px]" aria-labelledby="rating-heading">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="rating-heading" className="flex items-center gap-2 font-heading text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Rating
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              peak {profile.peakRating} · {profile.ratedGames} rated
            </span>
          </div>
          {profile.ratingHistory.length > 1 ? (
            <RatingChart points={profile.ratingHistory} className="mt-3" />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Ratings start at 1200 and settle after a few games. Play a rated game to start the curve.
            </p>
          )}
          {profile.recentForm.length > 0 ? (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Recent form</span>
              <div className="flex gap-1">
                {profile.recentForm.map((game) => (
                  <span
                    key={game.matchId}
                    title={game.result}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded font-mono text-[11px] font-bold",
                      game.result === "win" && "bg-emerald-500/15 text-emerald-400",
                      game.result === "loss" && "bg-destructive/15 text-destructive",
                      game.result === "draw" && "bg-amber-500/15 text-amber-400"
                    )}
                  >
                    {game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass-card flex flex-col justify-between gap-4 p-5">
          <div>
            <h2 className="font-heading text-sm font-semibold">Record</h2>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums">{stats.totalGames}</p>
            <p className="text-xs text-muted-foreground">games played</p>
            <div className="mt-2 flex items-center gap-3 font-mono text-xs tabular-nums">
              <span className="text-emerald-400">{stats.wins}W</span>
              <span className="text-destructive">{stats.losses}L</span>
              <span className="text-amber-400">{stats.draws}D</span>
              <span className="text-muted-foreground">
                {Math.round(stats.winRate * 100)}%
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-400">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              Streak {stats.currentStreak}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
              Best {stats.longestWinStreak}
            </span>
          </div>
        </div>
      </section>

      {/* ── Breakdowns ── */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Playing record in detail">
        <div className="glass-card p-5">
          <h2 className="font-heading text-sm font-semibold">By colour</h2>
          <ColorRow label="As White" tally={profile.byColor.white} />
          <ColorRow label="As Black" tally={profile.byColor.black} />
        </div>

        <div className="glass-card p-5">
          <h2 className="font-heading text-sm font-semibold">How games end</h2>
          {profile.endings.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No finished games yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {profile.endings.slice(0, 5).map((ending) => (
                <li key={`${ending.outcome}-${ending.reason}`} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">
                    {ending.outcome === "win" ? "Won" : ending.outcome === "loss" ? "Lost" : "Drew"} by{" "}
                    {formatEndReason(ending.reason)?.toLowerCase() ?? "unknown"}
                  </span>
                  <span className="font-mono tabular-nums">{ending.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="font-heading text-sm font-semibold">Favourite openings</h2>
          {profile.openings.white.length === 0 && profile.openings.black.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Openings appear once a few games are finished.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <OpeningList title="White" openings={profile.openings.white} />
              <OpeningList title="Black" openings={profile.openings.black} />
            </div>
          )}
        </div>
      </section>

      {/* ── Wagering ── */}
      <section className="glass-card mb-8 flex flex-wrap items-center gap-6 p-5">
        <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <p className="text-xs text-muted-foreground">Wagered</p>
          <p className="font-mono text-lg font-bold tabular-nums">
            {formatTokenAmount(stats.totalWagered)} {solanaConfig.wagerSymbol}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Won</p>
          <p
            className={cn(
              "font-mono text-lg font-bold tabular-nums",
              BigInt(stats.totalWon) > 0n ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {formatTokenAmount(stats.totalWon)} {solanaConfig.wagerSymbol}
          </p>
        </div>
        {profile.activeGames > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground">In progress</p>
            <p className="font-mono text-lg font-bold tabular-nums">{profile.activeGames}</p>
          </div>
        ) : null}
      </section>

      {/* ── Games ── */}
      <section aria-labelledby="games-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="games-heading" className="font-heading text-lg font-semibold">
            Games
          </h2>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={filter === option.key}
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs font-semibold transition-colors",
                  filter === option.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {liveMatches.length > 0 && filter === "all" ? (
          <div className="mb-3 grid gap-2">
            {liveMatches.map((match) => (
              <Link
                key={match.matchId}
                href={isOwnProfile ? playHref(match.matchId) : spectateHref(match.matchId)}
                className="glass-card flex items-center justify-between gap-3 p-3 transition-colors hover:border-border-hover"
              >
                <span className="inline-flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
                  Live vs{" "}
                  {playerLabel(
                    match.playerColor === "white" ? match.blackPlayer : match.whitePlayer,
                    match.playerColor === "white" ? match.blackName : match.whiteName
                  )}
                </span>
                <span className="text-xs font-semibold text-primary">
                  {isOwnProfile ? "Resume" : "Watch"}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        {finishedMatches.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Sword className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">
              {filter === "all" ? "No finished games yet" : `No ${filter}s yet`}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Finished games can be replayed move by move from here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {finishedMatches.map((match) => (
              <FinishedGameCard key={match.matchId} match={match} viewer={profile.wallet} />
            ))}
          </div>
        )}
      </section>
    </ProfileShell>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/arena"
        className="mb-6 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Arena
      </Link>
      {children}
    </div>
  );
}

function ColorRow({ label, tally }: { label: string; tally: ApiTally }) {
  const width = (value: number) => (tally.games > 0 ? (value / tally.games) * 100 : 0);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {tally.wins}/{tally.draws}/{tally.losses}
        </span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-card" aria-hidden="true">
        <span className="bg-emerald-500/70" style={{ width: `${width(tally.wins)}%` }} />
        <span className="bg-amber-500/70" style={{ width: `${width(tally.draws)}%` }} />
        <span className="bg-destructive/70" style={{ width: `${width(tally.losses)}%` }} />
      </div>
    </div>
  );
}

function OpeningList({
  title,
  openings,
}: {
  title: string;
  openings: Array<ApiTally & { move: string }>;
}) {
  if (openings.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {openings.map((opening) => (
          <li key={opening.move} className="flex justify-between gap-3">
            <span className="truncate font-mono">{opening.move}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {opening.games} · {Math.round((opening.wins / opening.games) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="glass-card h-48 animate-pulse" />
        <div className="glass-card h-48 animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="glass-card h-40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
