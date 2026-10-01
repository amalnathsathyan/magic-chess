"use client";

import { useCallback, useRef, useState } from "react";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { toast } from "sonner";
import type { MagicChessSession } from "@magic-chess/sdk";
import { submitMoveTx } from "../lib/magicblock";
import { useMagicSession } from "@/components/shared/MagicSessionProvider";

/**
 * Errors that mean "this program/rollup won't accept this way of authorizing
 * the session key", as opposed to an illegal move or a network failure.
 */
function isSessionAuthorizationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return [
    "unauthorizedsigner",
    "unauthorized signer",
    '"custom":6041',
    "invalidtoken",
    "notoken",
    "accountnotinitialized",
    '"custom":3012',
    "accountnotfound",
    "session_token",
    "session token",
    "session signer",
  ].some((needle) => message.includes(needle));
}

type SessionMode = "token" | "registered";

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

  // Which authorization the rollup accepted for each match, so later moves
  // skip a mode that already failed.
  const modeRef = useRef<Map<string, SessionMode>>(new Map());

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
        const session = getSession(matchId);
        if (!session) {
          console.info("[fast-play] no session key for this match; the wallet signs");
          return await submitMoveTx(client, matchId, from, to, promotion);
        }

        // MagicBlock's SessionTokenV2 first (accepted by every deployed program
        // version), then the key registered on the match (current program).
        const preferred = modeRef.current.get(matchId);
        const modes: SessionMode[] = session.token
          ? preferred === "registered"
            ? ["registered"]
            : ["token", "registered"]
          : ["registered"];
        let lastError: unknown;
        for (const mode of modes) {
          try {
            const result = await submitMoveTx(client, matchId, from, to, promotion, {
              signer: session.signer,
              expiresAt: session.expiresAt,
              token: mode === "token" ? session.token : undefined,
            });
            modeRef.current.set(matchId, mode);
            console.info(
              `[fast-play] move signed by session key ${session.signer.publicKey.toBase58()} (${mode})`
            );
            return result;
          } catch (error) {
            if (!isSessionAuthorizationError(error)) throw error;
            console.warn(`[fast-play] rollup rejected the session key (${mode})`, error);
            lastError = error;
          }
        }

        console.warn("[fast-play] session key not accepted; falling back to the wallet", lastError);
        toast.warning("Instant moves were turned off for this game", {
          description: "Your wallet will sign this move. Enable instant moves again to stop the popups.",
        });
        forgetMatch(matchId);
        modeRef.current.delete(matchId);
        return await submitMoveTx(client, matchId, from, to, promotion);
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
