"use client";

import { useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { solanaConfig } from "@/lib/solana-config";

/**
 * Native SOL balance of `address` on the app's cluster (devnet). Fetched
 * fresh whenever `enabled` turns on, e.g. each time the wallet menu opens.
 */
export function useSolBalance(address: string | null, enabled: boolean) {
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!address || !enabled) return;

    let cancelled = false;
    setError(false);
    const connection = new Connection(solanaConfig.rpcEndpoint, "confirmed");
    connection
      .getBalance(new PublicKey(address), "confirmed")
      .then((lamports) => {
        if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch((e) => {
        console.error("Failed to fetch SOL balance", e);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address, enabled]);

  // A balance fetched for a previous wallet must not show for the new one.
  useEffect(() => setBalance(null), [address]);

  return { balance, error };
}

export function formatSol(sol: number): string {
  return sol.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
