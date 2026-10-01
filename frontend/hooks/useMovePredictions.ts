"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  predictionsApi,
  type MarketSnapshot,
  type MyBet,
  type PredictionAccount,
  type SettledEvent,
} from "@/lib/predictions";

const POLL_MS = 15_000;

/**
 * Live market state for one match: REST snapshot + realtime pushes.
 * `liveMarket`/`liveSettled` come from the match's SSE feed when connected;
 * polling keeps it correct when it isn't.
 */
export function useMovePredictions(args: {
  matchId: string;
  token: string | null;
  address: string | null;
  liveMarket: MarketSnapshot | null;
  liveSettled: { sequence: number; data: SettledEvent } | null;
  onAccount?: (account: PredictionAccount) => void;
}) {
  const { matchId, token, address, liveMarket, liveSettled, onAccount } = args;
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const onAccountRef = useRef(onAccount);
  onAccountRef.current = onAccount;

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      const response = await predictionsApi.market(matchId, token);
      const { myBets: bets, ...snapshot } = response;
      setMarket(snapshot);
      setMyBets(bets);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Predictions are unavailable.");
    }
  }, [matchId, token]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Realtime market pushes (no personal data in them).
  useEffect(() => {
    if (liveMarket && liveMarket.matchId === matchId) setMarket(liveMarket);
  }, [liveMarket, matchId]);

  // A ply settled: refresh personal bets and celebrate a win.
  const lastSettled = useRef(0);
  useEffect(() => {
    if (!liveSettled || liveSettled.sequence === lastSettled.current) return;
    lastSettled.current = liveSettled.sequence;
    const { data } = liveSettled;
    const mine = address ? data.winners.find((winner) => winner.wallet === address) : null;
    if (mine) {
      toast.success(`You called it: ${data.actualSan}`, {
        description: `+${mine.payout} points`,
      });
    }
    void refresh();
  }, [address, liveSettled, refresh]);

  const place = useCallback(
    async (input: { ply: number; san: string; stake: number }) => {
      if (!token) throw new Error("Sign in to predict.");
      setSubmitting(true);
      try {
        const response = await predictionsApi.place(matchId, token, input);
        setMarket(response.snapshot);
        setMyBets(response.myBets);
        onAccountRef.current?.(response.account);
        return response;
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, token]
  );

  const cancel = useCallback(
    async (ply: number) => {
      if (!token) throw new Error("Sign in to predict.");
      setSubmitting(true);
      try {
        const response = await predictionsApi.cancel(matchId, token, ply);
        setMarket(response.snapshot);
        setMyBets(response.myBets);
        onAccountRef.current?.(response.account);
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, token]
  );

  return { market, myBets, error, submitting, refresh, place, cancel };
}
