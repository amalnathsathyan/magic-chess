"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Filter, Plus, RefreshCw, Search } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useMatches } from "@magic-chess/sdk/react";
import { MatchCard, type MatchCardData } from "@/components/lobby/MatchCard";
import { CreateMatchForm } from "@/components/lobby/CreateMatchForm";
import { api, type ApiMatch } from "@/lib/api";
import {
  formatOnChainTokenAmount,
  useMintDetails,
} from "@/hooks/useMintDetails";

type LobbyFilter = "all" | "open" | "in_progress" | "completed";

const EMPTY_PUBLIC_KEY = PublicKey.default.toBase58();

function normalizeStatus(status: string): MatchCardData["status"] {
  const normalized = status.toLowerCase().replaceAll("_", "");
  if (normalized === "active" || normalized === "inprogress") return "in_progress";
  if (normalized === "waitingforopponent" || normalized === "open") return "open";
  return "completed";
}

export default function ArenaPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LobbyFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [indexedMatches, setIndexedMatches] = useState<ApiMatch[]>([]);
  const [indexerLoading, setIndexerLoading] = useState(true);
  const [indexerError, setIndexerError] = useState(false);
  const { matches, loading, error } = useMatches();

  const loadIndexedMatches = useCallback(async () => {
    try {
      const response = await api.listMatches({ limit: 50 });
      setIndexedMatches(response.matches);
      setIndexerError(false);
    } catch {
      setIndexerError(true);
    } finally {
      setIndexerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIndexedMatches();
    const intervalId = window.setInterval(() => void loadIndexedMatches(), 10_000);
    return () => window.clearInterval(intervalId);
  }, [loadIndexedMatches]);

  const mintAddresses = useMemo(
    () => [
      ...matches.map((match) => match.bettingTokenMint.toBase58()),
      ...indexedMatches.map((match) => match.bettingTokenMint),
    ],
    [indexedMatches, matches]
  );
  const mintDetails = useMintDetails(mintAddresses);

  const matchCards = useMemo<MatchCardData[]>(() => {
    const byId = new Map<string, MatchCardData>();

    indexedMatches.forEach((match) => {
      const status = normalizeStatus(match.gameStatus);
      const mint = mintDetails.get(match.bettingTokenMint);
      byId.set(match.matchId, {
        matchId: match.matchId,
        whitePlayer: match.whitePlayer,
        blackPlayer: match.blackPlayer ?? undefined,
        wagerDisplay: formatOnChainTokenAmount(match.totalPot, mint),
        wagerMint: match.bettingTokenMint,
        wagerKind: "pot",
        timeControl:
          BigInt(match.moveTimeoutSeconds) > 0n
            ? `${match.moveTimeoutSeconds}s / move`
            : "Untimed",
        status,
        createdAt: Date.parse(match.createdAt),
      });
    });

    // Direct account reads win over the indexer for currently joinable matches.
    matches.forEach((match) => {
      const white = match.players[0].toBase58();
      const rawBlack = match.players[1].toBase58();
      const mintAddress = match.bettingTokenMint.toBase58();
      byId.set(match.matchId, {
        matchId: match.matchId,
        whitePlayer: white,
        blackPlayer: rawBlack === EMPTY_PUBLIC_KEY ? undefined : rawBlack,
        wagerDisplay: formatOnChainTokenAmount(
          match.betAmountPlayerOne,
          mintDetails.get(mintAddress)
        ),
        wagerMint: mintAddress,
        wagerKind: "entry",
        timeControl:
          match.moveTimeoutDuration > 0n
            ? `${Number(match.moveTimeoutDuration)}s / move`
            : "Untimed",
        status: "open",
        createdAt: Number(match.lastMoveTimestamp) * 1_000,
      });
    });

    const query = search.trim().toLowerCase();
    return [...byId.values()]
      .filter((match) => filter === "all" || match.status === filter)
      .filter((match) => {
        if (!query) return true;
        return [
          match.matchId,
          match.whitePlayer,
          match.blackPlayer,
          match.wagerMint,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const statusOrder = { in_progress: 0, open: 1, completed: 2 };
        return statusOrder[a.status] - statusOrder[b.status] || b.createdAt - a.createdAt;
      });
  }, [filter, indexedMatches, matches, mintDetails, search]);

  const counts = useMemo(
    () => {
      const statuses = new Map<string, MatchCardData["status"]>();
      indexedMatches.forEach((match) =>
        statuses.set(match.matchId, normalizeStatus(match.gameStatus))
      );
      matches.forEach((match) => statuses.set(match.matchId, "open"));
      const values = [...statuses.values()];
      return {
        open: values.filter((status) => status === "open").length,
        live: values.filter((status) => status === "in_progress").length,
      };
    },
    [indexedMatches, matches]
  );

  const isInitialLoading = loading && matches.length === 0 && indexerLoading;
  const hasAnySource = matches.length > 0 || indexedMatches.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-heading text-3xl font-bold">Live lobby</h1>
            {counts.live > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {counts.live} live
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground">
            Create, join, or watch from the same match link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-heading text-sm font-semibold text-primary-foreground transition-colors duration-100 hover:bg-primary-hover active:translate-y-px focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create match
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <label htmlFor="match-search" className="sr-only">
            Search matches
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="match-search"
            type="search"
            placeholder="Match, player, or mint"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="flex min-h-11 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card/50 p-1" aria-label="Filter matches">
          {([
            ["all", "All"],
            ["open", `Open ${counts.open}`],
            ["in_progress", `Live ${counts.live}`],
            ["completed", "Finished"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={
                filter === value
                  ? "min-h-9 whitespace-nowrap rounded-md bg-primary/15 px-3 text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary"
                  : "min-h-9 whitespace-nowrap rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:bg-card-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CreateMatchForm isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {error && hasAnySource ? (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          Open-match RPC refresh failed. Live indexed games are still shown.
        </div>
      ) : null}
      {indexerError && matches.length > 0 ? (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Live and completed games need the read-only indexer. Open on-chain matches are current.
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="grid gap-4" aria-label="Loading matches" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-44 animate-pulse rounded-xl border border-border bg-card/60 motion-reduce:animate-none" />
          ))}
        </div>
      ) : error && !hasAnySource ? (
        <div className="glass-card flex flex-col items-center py-14 text-center" role="alert">
          <AlertCircle className="mb-3 h-9 w-9 text-destructive" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">Couldn&apos;t load the lobby</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            The RPC and read-only indexer are unavailable. Check your connection and retry.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors duration-100 hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : matchCards.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
          <Filter className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">
            {search || filter !== "all" ? "No matching games" : "No matches yet"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {search || filter !== "all"
              ? "Change the search or filter to see another game."
              : "Create the first on-chain match and share its link with an opponent."}
          </p>
          {!search && (filter === "all" || filter === "open") ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-5 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              Create match
            </button>
          ) : null}
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
