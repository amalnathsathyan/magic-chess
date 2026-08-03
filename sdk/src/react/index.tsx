// @ts-nocheck
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FC, ReactNode } from "react";
import type { PublicKey } from "@solana/web3.js";
import type { AnchorWallet, Program } from "@anchor-lang/core";

import type { MagicChess } from "../idl/magic_chess";
import { MagicChessClient } from "../client";
import type { ChessMatch, MatchInfo, MoveMadeEvent } from "../types";
import type { MoveResult } from "../types";

// ── Context ────────────────────────────────────────────────────

interface MagicChessContextValue {
  client: MagicChessClient | null;
}

const MagicChessContext = createContext<MagicChessContextValue>({
  client: null,
});

/**
 * Provider that makes the MagicChessClient available to all child hooks.
 */
export const MagicChessProvider: FC<{
  program: Program<MagicChess>;
  wallet?: AnchorWallet;
  children: ReactNode;
}> = ({ program, wallet, children }) => {
  const client = useMemo(
    () => new MagicChessClient(program, wallet),
    [program, wallet]
  );

  return (
    <MagicChessContext.Provider value={{ client }}>
      {children}
    </MagicChessContext.Provider>
  );
};

// ── Hook: useMagicChessClient ──────────────────────────────────

/**
 * Get the MagicChessClient instance from context, or create one directly.
 */
export function useMagicChessClient(
  program?: Program<MagicChess>,
  wallet?: AnchorWallet
): MagicChessClient {
  const ctx = useContext(MagicChessContext);

  if (ctx.client) {
    return ctx.client;
  }

  if (!program) {
    throw new Error(
      "useMagicChessClient: either wrap with MagicChessProvider or pass program + wallet directly"
    );
  }

  return useMemo(() => new MagicChessClient(program, wallet), [program, wallet]);
}

// ── Hook: useMatch ─────────────────────────────────────────────

export interface UseMatchResult {
  match: ChessMatch | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch a single match by ID, with loading state and refetch capability.
 */
export function useMatch(matchId: string | null): UseMatchResult {
  const { client } = useContext(MagicChessContext);
  const [match, setMatch] = useState<ChessMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!client || !matchId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.getMatch(matchId);
      setMatch(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client, matchId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { match, loading, error, refetch: fetch };
}

// ── Hook: useMatches ───────────────────────────────────────────

export interface UseMatchesResult {
  matches: MatchInfo[];
  loading: boolean;
  error: Error | null;
}

/**
 * Fetch joinable matches, optionally filtered by mint.
 */
export function useMatches(filters?: { mint?: PublicKey }): UseMatchesResult {
  const { client } = useContext(MagicChessContext);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.listJoinableMatches(filters);
      setMatches(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client, filters?.mint?.toBase58()]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { matches, loading, error };
}

// ── Hook: usePlayerMatches ─────────────────────────────────────

export interface UsePlayerMatchesResult {
  matches: MatchInfo[];
  loading: boolean;
  error: Error | null;
}

/**
 * Fetch all matches for a given player.
 */
export function usePlayerMatches(
  player: PublicKey | null
): UsePlayerMatchesResult {
  const { client } = useContext(MagicChessContext);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!client || !player) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.getPlayerMatches(player);
      setMatches(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client, player?.toBase58()]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { matches, loading, error };
}

// ── Hook: useMatchEvents ───────────────────────────────────────

export interface MatchEventCallbacks {
  onMoveMade?: (event: MoveMadeEvent) => void;
  onGameEnded?: (event: {
    matchId: string;
    status: string;
    winner: string | null;
    reason: string;
  }) => void;
  onPlayerJoined?: (event: {
    matchId: string;
    playerOne: PublicKey;
    playerTwo: PublicKey;
  }) => void;
}

/**
 * Subscribe to real-time events for a given match via the program's event listener.
 * Returns a cleanup function to unsubscribe.
 *
 * NOTE: Event streaming depends on the Anchor provider's connection supporting
 * `onLogs` or equivalent. For production, consider using Helius webhooks or a
 * custom WebSocket relay.
 */
export function useMatchEvents(
  matchId: string | null,
  callbacks: MatchEventCallbacks
): () => void {
  const { client } = useContext(MagicChessContext);

  useEffect(() => {
    if (!client || !matchId) return;

    // Anchor v1.x Program exposes an event listener via addEventListener
    const program = client.program as any;
    let listenerId: number | undefined;

    if (typeof program.addEventListener === "function") {
      listenerId = program.addEventListener(
        "moveMadeEvent",
        (event: any) => {
          if (event.matchId === matchId || event.data?.matchId === matchId) {
            callbacks.onMoveMade?.(event.data ?? event);
          }
        }
      );
    }

    return () => {
      if (listenerId !== undefined) {
        program.removeEventListener?.(listenerId);
      }
    };
  }, [client, matchId, callbacks]);

  // Return a no-op cleanup as a secondary escape hatch
  return () => {};
}

// ── Re-export commonly used types ──────────────────────────────

export type {
  ChessMatch,
  MatchInfo,
  Move,
  MoveResult,
  CreateMatchParams,
  JoinMatchParams,
} from "../types";
