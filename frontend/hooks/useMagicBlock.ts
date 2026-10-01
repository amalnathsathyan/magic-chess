"use client";

import { useState, useCallback } from "react";
import { useMagicChessClient } from "@magic-chess/sdk/react";
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
  /** True once moves for this match sign locally (no wallet popups). */
  isFastPlayReady: (matchId: string) => boolean;
  enableFastPlay: (matchId?: string) => Promise<void>;
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
    ensureSession,
    forgetMatch,
    isRegistered,
  } = useMagicSession();

  const enableFastPlay = useCallback(
    async (matchId?: string) => {
      await ensureSession(matchId);
    },
    [ensureSession]
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
        // Fast play: a temporary key registered on this match signs the ER
        // move locally. Without one, the wallet signs (embedded wallets do it
        // silently for moves), so play never blocks on session setup.
        if (!isRegistered(matchId)) {
          return await submitMoveTx(client, matchId, from, to, promotion);
        }
        const activeSession = await ensureSession(matchId);
        try {
          return await submitMoveTx(client, matchId, from, to, promotion, activeSession);
        } catch (error) {
          if (!isSessionAuthorizationError(error)) throw error;
          forgetMatch(matchId);
          return await submitMoveTx(client, matchId, from, to, promotion);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, ensureSession, forgetMatch, isRegistered]
  );

  return {
    isSubmitting,
    sessionStatus,
    sessionError,
    isFastPlayReady: isRegistered,
    enableFastPlay,
    submitMove,
  };
}
