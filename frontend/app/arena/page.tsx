"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Filter, Plus, Search } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useMatches } from "@magic-chess/sdk/react";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import {
  formatTokenAmount,
  solanaConfig,
} from "@/lib/solana-config";

const APP_MATCH_ID = /^mc-[0-9a-f]{20}$/;
const SUPPORTED_MOVE_TIMEOUTS = new Set([60, 180, 600]);

export default function ArenaPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { matches, loading, error } = useMatches();

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
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create match
        </button>
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

      {loading ? (
        <div className="grid gap-4" aria-label="Loading open matches">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-xl border border-border bg-card/60"
            />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card flex flex-col items-center py-14 text-center">
          <AlertCircle className="mb-3 h-9 w-9 text-destructive" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">
            Couldn&apos;t load on-chain matches
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 min-h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            Retry
          </button>
        </div>
      ) : matchCards.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
          <Filter className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">
            {search ? "No matching lobbies" : "No open matches"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try another player address or match ID."
              : "Create the first on-chain match and invite an opponent."}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              Create match
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {matchCards.map((match) => (
            <MatchCard key={match.matchId} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
