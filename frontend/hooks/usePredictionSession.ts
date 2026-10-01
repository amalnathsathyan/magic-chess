"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import {
  predictionsApi,
  PredictionApiError,
  type PredictionAccount,
} from "@/lib/predictions";

const STORAGE_PREFIX = "magic-chess:predictions:";

interface StoredSession {
  token: string;
  expiresAt: number;
}

function load(wallet: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + wallet);
    const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
    return parsed && parsed.expiresAt > Date.now() + 60_000 ? parsed : null;
  } catch {
    return null;
  }
}

function save(wallet: string, session: StoredSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_PREFIX + wallet, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_PREFIX + wallet);
  } catch {
    // Storage unavailable: the session lasts for this page view only.
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

/**
 * Play-points identity for predictions. One free message signature (no
 * transaction) proves wallet ownership for 12 hours.
 */
export function usePredictionSession() {
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const wallet = selectSolanaWallet(wallets);
  const address = wallet?.address ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<PredictionAccount | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    setAccount(null);
    setToken(address ? load(address)?.token ?? null : null);
  }, [address]);

  const refreshAccount = useCallback(async () => {
    if (!token || !address) return;
    try {
      setAccount((await predictionsApi.me(token)).account);
    } catch (error) {
      if (error instanceof PredictionApiError && error.status === 401) {
        save(address, null);
        setToken(null);
      }
    }
  }, [address, token]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  const signIn = useCallback(async () => {
    if (!wallet) throw new Error("Connect a wallet to predict.");
    setSigningIn(true);
    try {
      const challenge = await predictionsApi.challenge(wallet.address);
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge.message),
        wallet,
        options: {
          uiOptions: {
            title: "Sign in to predictions",
            description: "Free signature, no transaction. Lets you predict moves with play points.",
          },
        },
      });
      const session = await predictionsApi.session({
        wallet: wallet.address,
        issuedAt: challenge.issuedAt,
        signature: toBase64(signature),
      });
      save(wallet.address, { token: session.token, expiresAt: session.expiresAt });
      setToken(session.token);
      setAccount(session.account);
      return session.token;
    } finally {
      setSigningIn(false);
    }
  }, [signMessage, wallet]);

  return {
    address,
    token,
    account,
    setAccount,
    signIn,
    signingIn,
    refreshAccount,
  };
}
