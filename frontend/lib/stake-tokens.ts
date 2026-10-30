import { PublicKey } from "@solana/web3.js";
import { solanaConfig, WRAPPED_SOL_MINT } from "@/lib/solana-config";

export interface StakeToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Stake presets shown under the amount field, as decimal strings. */
  presets: readonly string[];
}

const SOL: StakeToken = {
  mint: WRAPPED_SOL_MINT.toBase58(),
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  presets: ["0", "0.1", "0.5", "1"],
};

/**
 * The app's default stake token (NEXT_PUBLIC_WAGER_MINT). On devnet this is
 * the ZUG play token the faucet hands out, so new players can stake without
 * holding SOL. When it is unset or points at wrapped SOL, SOL is the default.
 */
export const DEFAULT_STAKE_TOKEN: StakeToken =
  solanaConfig.wagerMint && solanaConfig.wagerMint !== SOL.mint
    ? {
        mint: solanaConfig.wagerMint,
        symbol: solanaConfig.wagerSymbol === "WSOL" ? "ZUG" : solanaConfig.wagerSymbol,
        name: `${solanaConfig.wagerSymbol === "WSOL" ? "ZUG" : solanaConfig.wagerSymbol} play token`,
        decimals: solanaConfig.wagerDecimals,
        presets: ["0", "100", "500", "1000"],
      }
    : SOL;

/** Tokens the lobby lists matches for and the form offers first: default, then SOL. */
export const STAKE_TOKENS: readonly StakeToken[] =
  DEFAULT_STAKE_TOKEN.mint === SOL.mint ? [SOL] : [DEFAULT_STAKE_TOKEN, SOL];

const BY_MINT = new Map(STAKE_TOKENS.map((token) => [token.mint, token]));

export function findStakeToken(mint: string | PublicKey): StakeToken | undefined {
  return BY_MINT.get(typeof mint === "string" ? mint : mint.toBase58());
}

export function isKnownStakeMint(mint: string | PublicKey): boolean {
  return BY_MINT.has(typeof mint === "string" ? mint : mint.toBase58());
}

/** "0.5 SOL", "100 ZUG", or the raw amount for an unknown mint. */
export function formatStake(rawAmount: bigint, mint: string | PublicKey): string {
  const token = findStakeToken(mint);
  if (!token) return rawAmount.toString();
  const base = 10n ** BigInt(token.decimals);
  const whole = rawAmount / base;
  const fraction = (rawAmount % base).toString().padStart(token.decimals, "0").replace(/0+$/, "");
  return `${fraction ? `${whole}.${fraction}` : whole.toString()} ${token.symbol}`;
}
