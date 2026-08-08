"use client";

import { useState, useCallback } from "react";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { submitMoveTx } from "../lib/magicblock";

interface UseMagicBlockReturn {
  isSubmitting: boolean;
  submitMove: (matchId: string, from: string, to: string, promotion?: string) => Promise<string>;
}

/**
 * Hook for interacting with MagicBlock Ephemeral Rollups.
 * Uses the connected wallet and lets the SDK route base/ER transactions.
 */
export function useMagicBlock(): UseMagicBlockReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useMagicChessClient();

  const submitMove = useCallback(
    async (
      matchId: string,
      from: string,
      to: string,
      promotion?: string
    ): Promise<string> => {
      if (!client || !client.wallet) {
        throw new Error("Connect a wallet before submitting a move");
      }

      setIsSubmitting(true);
      try {
        const txSig = await submitMoveTx(client, matchId, from, to, promotion);
        return txSig;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client]
  );

  return {
    isSubmitting,
    submitMove,
  };
}
