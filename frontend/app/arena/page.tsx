"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Filter, History, Plus, RefreshCw, Search, Swords } from "lucide-react";
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

export default function ArenaPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { matches, loading, error, refetch } = useMatches();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { wallets } = useWallets();
  const walletAddress = selectSolanaWallet(wallets)?.address ?? null;
  const player = walletAddress ? new PublicKey(walletAddress) : null;
  const { matches: pastMatches, loading: pastLoading } = usePlayerMatches(player);
  const [showPast, setShowPast] = useState(false);
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

      {/* ── Past Matches ── */}
      {walletAddress && (
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setShowPast(!showPast)}
            className="mb-4 flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-card"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" aria-hidden="true" />
              Your past matches
              {!pastLoading && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {pastMatches.filter((m) => m.gameStatus !== GameStatus.WaitingForOpponent && m.gameStatus !== GameStatus.Active).length}
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showPast ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {showPast && (
            pastLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card/60" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {pastMatches
                  .filter((m) => m.gameStatus !== GameStatus.WaitingForOpponent && m.gameStatus !== GameStatus.Active)
                  .slice(0, 20)
                  .map((m) => (
                    <MatchCard
                      key={m.matchId}
                      match={{
                        matchId: m.matchId,
                        whitePlayer: m.players[0].toBase58(),
                        blackPlayer: m.players[1]?.equals(PublicKey.default) ? null : m.players[1]?.toBase58() ?? null,
                        gameStatus: GameStatus[m.gameStatus] as string,
                        totalPot: formatTokenAmount(m.betAmountPlayerOne),
                        wagerSymbol: solanaConfig.wagerSymbol,
                        moveTimeoutSeconds: Number(m.moveTimeoutDuration),
                        createdAt: new Date(Number(m.createdAt) * 1000).toISOString(),
                        bettingTokenMint: m.bettingTokenMint.toBase58(),
                      }}
                    />
                  ))}
                {pastMatches.filter((m) => m.gameStatus !== GameStatus.WaitingForOpponent && m.gameStatus !== GameStatus.Active).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No completed matches yet.</p>
                )}
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}
