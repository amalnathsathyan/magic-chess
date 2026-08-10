"use client";

import { useState, useCallback } from "react";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { submitMoveTx } from "../lib/magicblock";
import { useMagicSession } from "@/components/shared/MagicSessionProvider";

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
        const activeSession = session ?? (await ensureSession());
        return await submitMoveTx(
          client,
          matchId,
          from,
          to,
          promotion,
          activeSession
        );
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
