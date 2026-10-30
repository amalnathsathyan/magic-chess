"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  claimFaucet,
  FAUCET_CLAIMED_EVENT,
  fetchFaucetStatus,
  type FaucetClaimResult,
  type FaucetStatus,
} from "@/lib/faucet";

export interface FaucetState {
  status: FaucetStatus | null;
  loading: boolean;
  claiming: boolean;
  error: string | null;
  /** The devnet faucet is on for this deployment. */
  enabled: boolean;
  /** A claim is open for this wallet right now. */
  canClaim: boolean;
  claim: () => Promise<FaucetClaimResult | null>;
  refresh: () => Promise<void>;
}

/**
 * Devnet faucet state for the signed-in wallet. Polls nothing; refreshes when
 * the wallet changes, after a claim, and when another component claims.
 */
export function useFaucet(walletAddress: string | null | undefined): FaucetState {
  const { authenticated, ready } = usePrivy();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchFaucetStatus(authenticated ? walletAddress : null);
      setStatus(next);
      setError(null);
    } catch (cause) {
      // A sleeping API must not hide the lobby; the banner just stays away.
      setStatus((current) => current ?? { enabled: false });
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [authenticated, walletAddress]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
    })();
    const onClaimed = () => void refresh();
    window.addEventListener(FAUCET_CLAIMED_EVENT, onClaimed);
    return () => {
      cancelled = true;
      window.removeEventListener(FAUCET_CLAIMED_EVENT, onClaimed);
    };
  }, [ready, refresh]);

  const claim = useCallback(async () => {
    if (!walletAddress) return null;
    setClaiming(true);
    setError(null);
    try {
      const result = await claimFaucet(walletAddress);
      window.dispatchEvent(new CustomEvent(FAUCET_CLAIMED_EVENT, { detail: result }));
      await refresh();
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      await refresh().catch(() => undefined);
      throw cause;
    } finally {
      setClaiming(false);
    }
  }, [refresh, walletAddress]);

  const enabled = status?.enabled === true;
  const canClaim = enabled && status.wallet?.available != null;

  return { status, loading, claiming, error, enabled, canClaim, claim, refresh };
}
