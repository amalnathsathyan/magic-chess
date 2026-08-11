"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { solanaConfig, WRAPPED_SOL_MINT } from "@/lib/solana-config";

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  amount: bigint;
  decimals: number;
  uiAmount: number;
}

/**
 * Fetch all SPL token balances for a wallet, plus native SOL.
 * Returns a list sorted by USD value (approximate) or amount.
 */
export function useTokenBalances(walletAddress: string | null | undefined) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      setBalances([]);
      return;
    }

    let cancelled = false;
    const connection = new Connection(solanaConfig.rpcEndpoint, "confirmed");

    async function fetchBalances() {
      setLoading(true);
      try {
        const owner = new PublicKey(walletAddress!);
        const results: TokenBalance[] = [];

        // Fetch SOL balance
        const solBalance = await connection.getBalance(owner, "confirmed");
        results.push({
          mint: WRAPPED_SOL_MINT.toBase58(),
          symbol: "SOL",
          name: "Solana",
          amount: BigInt(solBalance),
          decimals: 9,
          uiAmount: Number(solBalance) / 1e9,
        });

        // Fetch all SPL token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          owner,
          { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") },
          "confirmed"
        );

        for (const { account } of tokenAccounts.value) {
          const info = account.data.parsed.info;
          const amount = BigInt(info.tokenAmount.amount);
          if (amount <= 0n) continue; // Skip zero-balance tokens

          results.push({
            mint: info.mint,
            symbol: info.tokenAmount.symbol || "???",
            name: info.tokenAmount.symbol || "Unknown Token",
            amount,
            decimals: info.tokenAmount.decimals,
            uiAmount: info.tokenAmount.uiAmount,
          });
        }

        if (!cancelled) setBalances(results);
      } catch {
        // Silently fail — token list will fall back to defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBalances();
    return () => { cancelled = true; };
  }, [walletAddress]);

  return { balances, loading };
}
