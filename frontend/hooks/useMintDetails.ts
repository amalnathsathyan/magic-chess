"use client";

import { useEffect, useMemo, useState } from "react";
import { getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { solanaConfig } from "@/lib/solana-config";

export interface MintDetails {
  address: string;
  decimals: number | null;
  symbol: string | null;
  loading: boolean;
  verifiedOnChain: boolean;
}

const connection = new Connection(solanaConfig.rpcEndpoint, "confirmed");
const mintCache = new Map<string, Omit<MintDetails, "loading">>();

function fallbackDetails(address: string): Omit<MintDetails, "loading"> {
  const isConfiguredMint = address === solanaConfig.wagerMint;
  return {
    address,
    decimals: isConfiguredMint ? solanaConfig.wagerDecimals : null,
    symbol: isConfiguredMint ? solanaConfig.wagerSymbol : null,
    verifiedOnChain: false,
  };
}

export function useMintDetails(addresses: string[]): Map<string, MintDetails> {
  const key = useMemo(
    () => [...new Set(addresses.filter(Boolean))].sort().join(","),
    [addresses]
  );
  const [details, setDetails] = useState<Map<string, MintDetails>>(new Map());

  useEffect(() => {
    const uniqueAddresses = key ? key.split(",") : [];
    let cancelled = false;

    setDetails(
      new Map(
        uniqueAddresses.map((address) => {
          const cached = mintCache.get(address);
          return [
            address,
            cached
              ? { ...cached, loading: false }
              : { ...fallbackDetails(address), loading: true },
          ];
        })
      )
    );

    const unresolved = uniqueAddresses.filter((address) => !mintCache.has(address));
    if (unresolved.length === 0) return;

    void Promise.all(
      unresolved.map(async (address) => {
        const fallback = fallbackDetails(address);
        try {
          const mint = await getMint(connection, new PublicKey(address), "confirmed");
          return {
            address,
            decimals: mint.decimals,
            symbol: fallback.symbol,
            verifiedOnChain: true,
          } satisfies Omit<MintDetails, "loading">;
        } catch {
          return fallback;
        }
      })
    ).then((resolved) => {
      resolved.forEach((item) => mintCache.set(item.address, item));
      if (cancelled) return;
      setDetails(
        new Map(
          uniqueAddresses.map((address) => [
            address,
            { ...(mintCache.get(address) ?? fallbackDetails(address)), loading: false },
          ])
        )
      );
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return details;
}

export function formatOnChainTokenAmount(
  rawAmount: bigint | number | string | { toString(): string },
  details: MintDetails | undefined
): string {
  const raw = BigInt(rawAmount.toString());
  if (raw === 0n) return "Free";
  if (details?.decimals === null || details?.decimals === undefined) {
    return `${raw.toString()} raw units`;
  }

  const base = 10n ** BigInt(details.decimals);
  const whole = raw / base;
  const fraction = (raw % base)
    .toString()
    .padStart(details.decimals, "0")
    .replace(/0+$/, "");
  const amount = fraction ? `${whole}.${fraction}` : whole.toString();
  return details.symbol ? `${amount} ${details.symbol}` : amount;
}

