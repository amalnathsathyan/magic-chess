"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, History, Plus, RefreshCw, Search, Swords, Activity } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { useMatches, usePlayerMatches } from "@magic-chess/sdk/react";
import { GameStatus, type MatchInfo } from "@magic-chess/sdk";
import { LiveGames } from "@/components/lobby/LiveGames";
import { RecentGames } from "@/components/lobby/RecentGames";
import { TimeoutClaims } from "@/components/lobby/TimeoutClaims";
import { FaucetBanner } from "@/components/lobby/FaucetBanner";
import { api, type ApiMatch } from "@/lib/api";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { findStakeToken, formatStake, isKnownStakeMint } from "@/lib/stake-tokens";

const APP_MATCH_ID = /^mc-[0-9a-f]{20}$/;
const SUPPORTED_MOVE_TIMEOUTS = new Set([60, 180, 600]);
const AUTO_REFRESH_MS = 15_000;

const API_STATUS: Record<string, GameStatus> = {
  WaitingForOpponent: GameStatus.WaitingForOpponent,
  Active: GameStatus.Active,
  WhiteWins: GameStatus.WhiteWins,
  BlackWins: GameStatus.BlackWins,
  Draw: GameStatus.Draw,
  Aborted: GameStatus.Aborted,
};

/** Indexed match → the SDK's MatchInfo shape used by the cards below. */
function apiToMatchInfo(match: ApiMatch): MatchInfo | null {
  const gameStatus = API_STATUS[match.gameStatus];
  if (!gameStatus) return null;
  try {
    const wager = BigInt(match.betAmountPerPlayer ?? "0");
    return {
      matchId: match.matchId,
      players: [
        new PublicKey(match.whitePlayer),
        match.blackPlayer ? new PublicKey(match.blackPlayer) : PublicKey.default,
      ],
      gameStatus,
      bettingTokenMint: new PublicKey(match.bettingTokenMint),
      betAmountPlayerOne: wager,
      totalPot: BigInt(match.totalPot ?? "0"),
      moveTimeoutDuration: BigInt(match.moveTimeoutSeconds ?? "0"),
      lastMoveTimestamp: BigInt(Math.floor(Date.parse(match.lastMoveAt) / 1000) || 0),
      fullmoveNumber: Math.floor((match.moveCount ?? 0) / 2) + 1,
      isFree: wager === 0n,
    };
  } catch {
    return null;
  }
}

/**
 * The wallet's matches. In-progress games are delegated to MagicBlock, so the
 * base-layer program scan can't see them; the indexer can. Merge both.
 */
function useMyMatches(walletAddress: string | null, chainMatches: MatchInfo[]) {
  const [indexed, setIndexed] = useState<MatchInfo[]>([]);
  useEffect(() => {
    if (!walletAddress) {
      setIndexed([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .listMatches({ player: walletAddress, limit: 50 })
        .then(({ matches }) => {
          if (!cancelled) {
            setIndexed(matches.map(apiToMatchInfo).filter((m): m is MatchInfo => m !== null));
          }
        })
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [walletAddress]);

  return useMemo(() => {
    const byId = new Map<string, MatchInfo>();
    for (const match of indexed) byId.set(match.matchId, match);
    for (const match of chainMatches) byId.set(match.matchId, match); // chain wins
    return [...byId.values()].sort(
      (a, b) => Number(b.lastMoveTimestamp) - Number(a.lastMoveTimestamp)
    );
  }, [chainMatches, indexed]);
}

/** Map a GameStatus enum value to a human-readable result label. */
function gameStatusToResult(status: GameStatus): string | undefined {
  switch (status) {
    case GameStatus.WhiteWins:
      return "White won";
    case GameStatus.BlackWins:
      return "Black won";
    case GameStatus.Draw:
      return "Draw";
    case GameStatus.Aborted:
      return "Aborted";
    default:
      return undefined;
  }
}

export default function ArenaPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { matches, loading, error, refetch } = useMatches();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { wallets } = useWallets();
  const walletAddress = selectSolanaWallet(wallets)?.address ?? null;
  const player = walletAddress ? new PublicKey(walletAddress) : null;
  const {
    matches: chainPlayerMatches,
    loading: playerMatchesLoading,
    error: playerMatchesError,
  } = usePlayerMatches(player);
  const playerMatches = useMyMatches(walletAddress, chainPlayerMatches);
  const [activeTab, setActiveTab] = useState<"past" | "live" | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refetch();
    }, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refetch]);

  const matchCards = useMemo<MatchCardData[]>(() => {
    const query = search.trim().toLowerCase();
    return matches
      .filter((match) => {
        const moveTimeout = Number(match.moveTimeoutDuration);
        return (
          APP_MATCH_ID.test(match.matchId) &&
          !match.players[0].equals(PublicKey.default) &&
          match.players[1].equals(PublicKey.default) &&
          isKnownStakeMint(match.bettingTokenMint) &&
          SUPPORTED_MOVE_TIMEOUTS.has(moveTimeout)
        );
      })
      .map((match) => {
        const white = match.players[0].toBase58();
        const black = match.players[1].equals(PublicKey.default)
          ? undefined
          : match.players[1].toBase58();
        return {
          matchId: match.matchId,
          whitePlayer: white,
          blackPlayer: black,
          wagerAmount: formatStake(match.betAmountPlayerOne, match.bettingTokenMint).split(" ")[0],
          wagerToken: findStakeToken(match.bettingTokenMint)?.symbol ?? "",
          timeControl: `${Number(match.moveTimeoutDuration)}s / move`,
          status: "open" as const,
          isOwn: white === walletAddress,
          createdAt: Number(match.lastMoveTimestamp) * 1_000,
        };
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .filter((match) => {
        if (!query) return true;
        return [match.matchId, match.whitePlayer, match.blackPlayer]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      });
  }, [matches, search, walletAddress]);

  const yourLive = playerMatches.filter((m) => m.gameStatus === GameStatus.Active);
  const yourPast = playerMatches.filter(
    (m) => m.gameStatus !== GameStatus.WaitingForOpponent && m.gameStatus !== GameStatus.Active
  );
  const yourTab = activeTab ?? (yourLive.length > 0 ? "live" : "past");
  const yourList = yourTab === "live" ? yourLive : yourPast;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl sm:text-6xl">Play</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh matches"
            title="Refresh"
            className="btn btn-secondary w-11 px-0"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing || loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New match
          </button>
        </div>
      </div>

      {/* Devnet only: free ZUG to stake with. */}
      <FaucetBanner walletAddress={walletAddress} />
      <TimeoutClaims walletAddress={walletAddress} />

      <CreateMatchForm
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* One column on phones (open, yours, live, recent); two on desktop with
          the sidebar spanning both rows. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section className="panel min-w-0" aria-labelledby="open-matches-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id="open-matches-heading" className="section-title">
                Open matches
                {matchCards.length > 0 ? (
                  <span className="ml-2 font-normal text-muted-foreground tnum">{matchCards.length}</span>
                ) : null}
              </h2>
              <div className="relative w-full sm:w-64">
                <label htmlFor="match-search" className="sr-only">
                  Search open matches
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="match-search"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Player or match ID…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 w-full border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-border-hover focus-visible:outline-none"
                />
              </div>
            </div>

            {loading && matchCards.length === 0 ? (
              <div className="divide-y divide-border" aria-label="Loading open matches">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-[68px] animate-pulse bg-card-hover/40" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <AlertCircle className="mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
                <p className="text-sm font-medium">Couldn&apos;t load matches from Solana.</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">{error.message}</p>
                <button onClick={handleRefresh} className="btn btn-secondary btn-sm mt-4">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : matchCards.length === 0 ? (
              search ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No open match matches &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <Swords className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">No open matches</p>
                  <p className="mt-1 text-sm text-muted-foreground">Start one and send the link.</p>
                  <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm mt-5">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New match
                  </button>
                </div>
              )
            ) : (
              <div className="divide-y divide-border">
                {matchCards.map((match) => (
                  <MatchCard key={match.matchId} match={match} />
                ))}
              </div>
            )}
          </section>

        <aside className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {walletAddress ? (
            <section className="panel" aria-labelledby="your-games-heading">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 id="your-games-heading" className="section-title">
                  Your games
                </h2>
                <div className="flex gap-1">
                  <YourTab active={yourTab === "live"} onClick={() => setActiveTab("live")}>
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    In play
                    {!playerMatchesLoading ? <span className="tnum">{yourLive.length}</span> : null}
                  </YourTab>
                  <YourTab active={yourTab === "past"} onClick={() => setActiveTab("past")}>
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    Finished
                    {!playerMatchesLoading ? <span className="tnum">{yourPast.length}</span> : null}
                  </YourTab>
                </div>
              </div>
              {playerMatchesLoading ? (
                <div className="divide-y divide-border">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-[68px] animate-pulse bg-card-hover/40" />
                  ))}
                </div>
              ) : playerMatchesError && playerMatches.length === 0 ? (
                <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  {playerMatchesError.message}
                </p>
              ) : yourList.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {yourTab === "live" ? "No games in play." : "No finished games yet."}
                </p>
              ) : (
                <div className="max-h-[22rem] divide-y divide-border overflow-y-auto overscroll-contain">
                  {yourList.slice(0, 20).map((m) => (
                    <MatchCard
                      key={m.matchId}
                      compact
                      match={{
                        matchId: m.matchId,
                        whitePlayer: m.players[0].toBase58(),
                        blackPlayer: m.players[1].equals(PublicKey.default)
                          ? undefined
                          : m.players[1].toBase58(),
                        wagerAmount: formatStake(m.betAmountPlayerOne, m.bettingTokenMint).split(" ")[0],
                        wagerToken: findStakeToken(m.bettingTokenMint)?.symbol ?? "",
                        timeControl: `${Number(m.moveTimeoutDuration)}s / move`,
                        status: yourTab === "live" ? "in_progress" : "completed",
                        isOwn: true,
                        createdAt: Number(m.lastMoveTimestamp) * 1_000,
                        result: yourTab === "live" ? undefined : gameStatusToResult(m.gameStatus),
                        moveCount: m.fullmoveNumber,
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="panel" aria-labelledby="live-games-heading">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id="live-games-heading" className="section-title flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
                Live now
              </h2>
              <span className="text-xs text-muted-foreground">Watch and predict</span>
            </div>
            <LiveGames excludePlayer={walletAddress} />
          </section>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <RecentGames walletAddress={walletAddress} />
        </div>
      </div>
    </div>
  );
}

function YourTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active ? "bg-card-hover text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
