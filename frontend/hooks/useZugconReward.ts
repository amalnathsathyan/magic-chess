"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignMessage, type ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import { api, type ApiRewardClaim, type ApiRewardStatus } from "@/lib/api";
import { apiErrorMessage } from "@/lib/players";

export type ClaimPhase = "idle" | "signing" | "sending" | "done" | "error";

/**
 * ZUGCON reward for a finished game: loads eligibility for the connected
 * wallet, and claims it with one free signature. The backend re-checks the
 * result on the devnet chain and sends the mainnet tokens; the wallet signs
 * nothing but a message, so the player pays no fee.
 */
export function useZugconReward(args: {
  matchId: string | null;
  wallet: ConnectedStandardSolanaWallet | undefined;
  /** Only finished games are checked (each check costs a chain read). */
  finished: boolean;
}) {
  const { matchId, wallet, finished } = args;
  const walletAddress = wallet?.address ?? null;
  const { signMessage } = useSignMessage();
  const [status, setStatus] = useState<ApiRewardStatus | null>(null);
  const [phase, setPhase] = useState<ClaimPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ApiRewardClaim | null>(null);
  const attempt = useRef(0);

  const refresh = useCallback(async () => {
    if (!matchId || !walletAddress || !finished) return;
    const id = ++attempt.current;
    try {
      const next = await api.getRewardStatus(matchId, walletAddress);
      if (id !== attempt.current) return;
      setStatus(next);
      if (next.claim) setClaim(next.claim);
      if (next.claim?.status === "sent") setPhase("done");
    } catch {
      // The reward is optional; a failed read just hides the banner.
    }
  }, [finished, matchId, walletAddress]);

  useEffect(() => {
    setStatus(null);
    setClaim(null);
    setPhase("idle");
    setError(null);
    void refresh();
  }, [refresh]);

  // The index can lag the chain by a sweep; retry while not yet claimable.
  useEffect(() => {
    if (!status?.enabled || !status.eligibility) return;
    const { eligible, code } = status.eligibility;
    if (eligible || claim?.status === "sent") return;
    if (code !== "chain_mismatch" && code !== "chain_unavailable" && code !== "not_finished") return;
    const timer = window.setTimeout(() => void refresh(), 5_000);
    return () => window.clearTimeout(timer);
  }, [claim?.status, refresh, status]);

  const claimReward = useCallback(async () => {
    if (!matchId || !wallet) return;
    setError(null);
    setPhase("signing");
    try {
      const challenge = await api.getRewardChallenge(matchId, wallet.address);
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge.message),
        wallet,
        options: {
          uiOptions: {
            title: "Claim your ZUGCON",
            description: "Free signature, no transaction. It proves this wallet played the game.",
          },
        },
      });
      let binary = "";
      signature.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      setPhase("sending");
      const result = await api.claimReward(matchId, {
        wallet: wallet.address,
        issuedAt: challenge.issuedAt,
        signature: window.btoa(binary),
      });
      setClaim(result.claim);
      setPhase(result.claim.status === "sent" ? "done" : "error");
      if (result.claim.status !== "sent") {
        setError(result.claim.error ?? "The transfer didn't go through. Try again.");
      }
    } catch (caught) {
      setPhase("error");
      setError(apiErrorMessage(caught, "We couldn't send your ZUGCON. Try again in a moment."));
    }
  }, [matchId, signMessage, wallet]);

  return { status, claim, phase, error, claimReward, refresh };
}
