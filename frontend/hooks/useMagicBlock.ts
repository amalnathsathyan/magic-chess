"use client";

import { useState, useCallback } from "react";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import type { MagicChessSession } from "@magic-chess/sdk";
import { submitMoveTx } from "../lib/magicblock";
import { useMagicSession } from "@/components/shared/MagicSessionProvider";

function isSessionAuthorizationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unauthorizedsigner") ||
    message.includes("unauthorized signer") ||
    message.includes("6041") ||
    message.includes("session token") ||
    message.includes("session signer")
  );
}

interface UseMagicBlockReturn {
  isSubmitting: boolean;
  sessionStatus: "idle" | "authorizing" | "ready" | "error";
  sessionError: string | null;
  /** The fast-play key saved for this match, if any. */
  getFastPlaySession: (matchId: string) => MagicChessSession | null;
  /** Register a key on a running match (one approval). */
  enableFastPlay: (matchId: string) => Promise<void>;
  /** Drop a saved key the match no longer accepts. */
  forgetFastPlay: (matchId: string) => void;
  submitMove: (
    matchId: string,
    from: string,
    to: string,
    promotion?: string
  ) => Promise<{ signature: string; rpcEndpoint: string }>;
}

/**
 * Hook for interacting with MagicBlock Ephemeral Rollups.
 * Uses the connected wallet and lets the SDK route base/ER transactions.
 */
export function useMagicBlock(): UseMagicBlockReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useMagicChessClient();
  const {
    status: sessionStatus,
    error: sessionError,
    getSession,
    enableForMatch,
    forgetMatch,
  } = useMagicSession();

  const enableFastPlay = useCallback(
    async (matchId: string) => {
      await enableForMatch(matchId);
    },
    [enableForMatch]
  );

  const submitMove = useCallback(
    async (
      matchId: string,
      from: string,
      to: string,
      promotion?: string
    ): Promise<{ signature: string; rpcEndpoint: string }> => {
      if (!client || !client.wallet) {
        throw new Error("Connect a wallet before submitting a move");
      }

      setIsSubmitting(true);
      try {
        // Fast play: the key registered on this match at create/join signs the
        // ER move locally. Without one, the wallet signs.
        const session = getSession(matchId);
        if (!session) {
          return await submitMoveTx(client, matchId, from, to, promotion);
        }
        try {
          return await submitMoveTx(client, matchId, from, to, promotion, session);
        } catch (error) {
          if (!isSessionAuthorizationError(error)) throw error;
          forgetMatch(matchId);
          return await submitMoveTx(client, matchId, from, to, promotion);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, forgetMatch, getSession]
  );

  return {
    isSubmitting,
    sessionStatus,
    sessionError,
    getFastPlaySession: getSession,
    enableFastPlay,
    forgetFastPlay: forgetMatch,
    submitMove,
  };
}
