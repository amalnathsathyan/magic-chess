"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, Filter, History, Plus, RefreshCw, Search, Swords, Activity } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { useMatches, usePlayerMatches } from "@magic-chess/sdk/react";
import { GameStatus } from "@magic-chess/sdk";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import {
  formatTokenAmount,
  solanaConfig,
} from "@/lib/solana-config";

const APP_MATCH_ID = /^mc-[0-9a-f]{20}$/;
const SUPPORTED_MOVE_TIMEOUTS = new Set([60, 180, 600]);
const AUTO_REFRESH_MS = 15_000;

/** Map a GameStatus enum value to a human-readable result label. */
function gameStatusToResult(status: GameStatus): string | undefined {
  switch (status) {
    case GameStatus.WhiteWins:
      return "White Wins";
    case GameStatus.BlackWins:
      return "Black Wins";
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
  const { matches: playerMatches, loading: playerMatchesLoading, error: playerMatchesError } = usePlayerMatches(player);
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
          match.bettingTokenMint.toBase58() === solanaConfig.wagerMint &&
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
          wagerAmount: formatTokenAmount(match.betAmountPlayerOne),
          wagerToken: solanaConfig.wagerSymbol,
          timeControl: `${Number(match.moveTimeoutDuration)}s / move`,
          status: "open" as const,
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
  }, [matches, search]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-heading text-3xl font-bold">Live lobby</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Join an open on-chain match or create your own.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh match list"
            className="relative inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
            {/* Pulsing dot indicator while fetching */}
            {(loading || isRefreshing) && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
              </span>
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create match
          </button>
        </div>
      </motion.div>

      <div className="mb-6">
        <label htmlFor="match-search" className="sr-only">
          Search open matches
        </label>
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="match-search"
            type="search"
            placeholder="Search by match or player"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      <CreateMatchForm
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {loading && matchCards.length === 0 ? (
        <div className="grid gap-4" aria-label="Loading open matches">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-xl border border-border bg-card/60"
            />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card flex flex-col items-center py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">
            Couldn&apos;t load on-chain matches
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {error.message}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : matchCards.length === 0 ? (
        // Empty state — different for search vs no matches
        search ? (
          <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">
              No matches found
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another player address or match ID.
            </p>
          </div>
        ) : (
          <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
            <Swords className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">
              No open matches
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              The arena is quiet. Create the first on-chain match and invite an opponent.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create match
            </button>
          </div>
        )
      ) : (
        <div className="grid gap-4">
          {matchCards.map((match) => (
            <MatchCard key={match.matchId} match={match} />
          ))}
        </div>
      )}

      {/* ── Your Matches (Live + Past) ── */}
      {walletAddress && (
        <section className="mt-10">
          {/* Tab bar */}
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "live" ? null : "live")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === "live"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border hover:bg-card"
              }`}
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              Live matches
              {!playerMatchesLoading && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                  {playerMatches.filter((m) => m.gameStatus === GameStatus.Active).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "past" ? null : "past")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === "past"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-card"
              }`}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Your past matches
              {!playerMatchesLoading && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {playerMatches.filter((m) => m.gameStatus !== GameStatus.WaitingForOpponent && m.gameStatus !== GameStatus.Active).length}
                </span>
              )}
            </button>
          </div>

          {/* Live matches tab */}
          {activeTab === "live" && (
            <div className="grid gap-3">
              {playerMatchesLoading ? (
                [0, 1].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
                ))
              ) : playerMatchesError ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <AlertCircle className="mb-2 h-8 w-8 text-destructive" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">{playerMatchesError.message}</p>
                </div>
              ) : (() => {
                const live = playerMatches.filter((m) => m.gameStatus === GameStatus.Active);
                if (live.length === 0) {
                  return (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No live matches right now.
                    </p>
                  );
                }
                return live.slice(0, 20).map((m) => (
                  <MatchCard
                    key={m.matchId}
                    match={{
                      matchId: m.matchId,
                      whitePlayer: m.players[0].toBase58(),
                      blackPlayer: m.players[1].equals(PublicKey.default)
                        ? undefined
                        : m.players[1].toBase58(),
                      wagerAmount: formatTokenAmount(m.betAmountPlayerOne),
                      wagerToken: solanaConfig.wagerSymbol,
                      timeControl: `${Number(m.moveTimeoutDuration)}s / move`,
                      status: "in_progress",
                      createdAt: Number(m.lastMoveTimestamp) * 1_000,
                      moveCount: m.fullmoveNumber,
                    }}
                  />
                ));
              })()}
            </div>
          )}

          {/* Past matches tab */}
          {activeTab === "past" && (
            <div className="grid gap-3">
              {playerMatchesLoading ? (
                [0, 1].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
                ))
              ) : playerMatchesError ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <AlertCircle className="mb-2 h-8 w-8 text-destructive" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">{playerMatchesError.message}</p>
                </div>
              ) : (() => {
                const past = playerMatches.filter(
                  (m) =>
                    m.gameStatus !== GameStatus.WaitingForOpponent &&
                    m.gameStatus !== GameStatus.Active
                );
                if (past.length === 0) {
                  return (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No completed matches yet.
                    </p>
                  );
                }
                return past.slice(0, 20).map((m) => (
                  <MatchCard
                    key={m.matchId}
                    match={{
                      matchId: m.matchId,
                      whitePlayer: m.players[0].toBase58(),
                      blackPlayer: m.players[1].equals(PublicKey.default)
                        ? undefined
                        : m.players[1].toBase58(),
                      wagerAmount: formatTokenAmount(m.betAmountPlayerOne),
                      wagerToken: solanaConfig.wagerSymbol,
                      timeControl: `${Number(m.moveTimeoutDuration)}s / move`,
                      status: "completed",
                      createdAt: Number(m.lastMoveTimestamp) * 1_000,
                      result: gameStatusToResult(m.gameStatus),
                      moveCount: m.fullmoveNumber,
                    }}
                  />
                ));
              })()}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
