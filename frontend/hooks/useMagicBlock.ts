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
  enableFastPlay: () => Promise<void>;
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
  const { session, status: sessionStatus, error: sessionError, ensureSession } =
    useMagicSession();

  const enableFastPlay = useCallback(async () => {
    await ensureSession();
  }, [ensureSession]);

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
        // One wallet approval creates the short-lived SessionTokenV2. The
        // actual ER move is then signed locally by the temporary key.
        let activeSession = session;
        if (!activeSession) {
          try {
            activeSession = await ensureSession();
          } catch {
            // SessionTokenV2 may not be cloned to the selected ER yet. Keep
            // the game playable with the connected wallet signer.
            return await submitMoveTx(client, matchId, from, to, promotion);
          }
        }

        try {
          return await submitMoveTx(
            client,
            matchId,
            from,
            to,
            promotion,
            activeSession
          );
        } catch (error) {
          if (!isSessionAuthorizationError(error)) throw error;
          return await submitMoveTx(client, matchId, from, to, promotion);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, ensureSession, session]
  );

  return {
    isSubmitting,
    sessionStatus,
    sessionError,
    enableFastPlay,
    submitMove,
  };
}
