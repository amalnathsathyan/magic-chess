import { PublicKey } from "@solana/web3.js";
import { MAGIC_CHESS_IDL } from "@magic-chess/sdk";

export const WRAPPED_SOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export const solanaConfig = {
  rpcEndpoint:
    process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://rpc.magicblock.app/devnet",
  rpcWsEndpoint:
    process.env.NEXT_PUBLIC_RPC_WS_ENDPOINT ??
    (process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://rpc.magicblock.app/devnet")
      .replace(/^https:/, "wss:")
      .replace(/^http:/, "ws:"),
  routerEndpoint:
    process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER ??
    "https://devnet-router.magicblock.app/",
  programId:
    process.env.NEXT_PUBLIC_PROGRAM_ID ?? MAGIC_CHESS_IDL.address,
  wagerMint:
    process.env.NEXT_PUBLIC_WAGER_MINT ?? WRAPPED_SOL_MINT.toBase58(),
  wagerSymbol: process.env.NEXT_PUBLIC_WAGER_SYMBOL ?? "WSOL",
  wagerDecimals: Number(process.env.NEXT_PUBLIC_WAGER_DECIMALS ?? "9"),
  platformFeeWallet: process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET ?? "",
  platformFeeBps: Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_BPS ?? "100"),
} as const;

export function getPlatformFeeWallet(): PublicKey {
  if (!solanaConfig.platformFeeWallet) {
    throw new Error(
      "NEXT_PUBLIC_PLATFORM_FEE_WALLET is not configured for this deployment."
    );
  }
  return new PublicKey(solanaConfig.platformFeeWallet);
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid wager amount.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Use no more than ${decimals} decimal places.`);
  }

  const units = BigInt(whole) * 10n ** BigInt(decimals);
  const fractionalUnits = BigInt(fraction.padEnd(decimals, "0") || "0");
  const amount = units + fractionalUnits;
  return amount;
}

export function formatTokenAmount(
  rawAmount: bigint | number | string | { toString(): string },
  decimals = solanaConfig.wagerDecimals
): string {
  const raw = BigInt(rawAmount.toString());
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
