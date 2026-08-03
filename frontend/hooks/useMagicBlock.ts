"use client";

import { useState, useCallback } from "react";

interface SessionConfig {
  rpcEndpoint: string;
  programId: string;
}

interface UseMagicBlockReturn {
  isConnected: boolean;
  isSubmitting: boolean;
  sessionId: string | null;
  connect: (config: SessionConfig) => Promise<void>;
  disconnect: () => void;
  submitMove: (matchId: string, from: string, to: string, promotion?: string) => Promise<string | null>;
}

/**
 * Hook for interacting with MagicBlock Ephemeral Rollups.
 * Handles session management and gasless transaction submission.
 *
 * TODO: Replace mock implementation with @magic-chess/sdk
 * once the SDK's MagicBlock client is wired up.
 */
export function useMagicBlock(): UseMagicBlockReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const connect = useCallback(async (config: SessionConfig) => {
    // TODO: Replace with actual MagicBlock session creation via SDK
    console.log("Connecting to MagicBlock ER:", config.rpcEndpoint);
    setSessionId(`session_${Date.now()}`);
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setSessionId(null);
    setIsConnected(false);
  }, []);

  const submitMove = useCallback(
    async (
      _matchId: string,
      _from: string,
      _to: string,
      _promotion?: string
    ): Promise<string | null> => {
      if (!isConnected) return null;

      setIsSubmitting(true);
      try {
        // TODO: Replace with actual SDK call
        // const txSig = await sdk.er.submitMove(...);
        // return txSig;

        // Mock delay
        await new Promise((r) => setTimeout(r, 500));
        return `tx_mock_${Date.now()}`;
      } finally {
        setIsSubmitting(false);
      }
    },
    [isConnected]
  );

  return {
    isConnected,
    isSubmitting,
    sessionId,
    connect,
    disconnect,
    submitMove,
  };
}
