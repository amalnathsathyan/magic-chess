/**
 * Devnet ZUG faucet client. Devnet only: the backend hands out play tokens
 * (10000 ZUG on the first claim, 1000 ZUG once per UTC day) so testers can
 * stake without holding SOL. Remove with the faucet when the app goes to mainnet.
 */
import { getAccessToken } from "@privy-io/react-auth";
import { solanaConfig } from "@/lib/solana-config";

export type FaucetClaimKind = "signup" | "daily";

export interface FaucetWalletStatus {
  available: FaucetClaimKind | null;
  /** When the next claim opens (ISO), while none is available. */
  nextAt: string | null;
  signupClaimed: boolean;
  totalClaimed: string;
}

export type FaucetStatus =
  | { enabled: false }
  | {
      enabled: true;
      mint: string;
      symbol: string;
      decimals: number;
      signupAmount: number;
      dailyAmount: number;
      treasuryRemaining: string | null;
      wallet?: FaucetWalletStatus;
    };

export interface FaucetClaimResult {
  kind: FaucetClaimKind;
  amount: number;
  signature: string;
}

export class FaucetRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "FaucetRequestError";
  }
}

const apiUrl = () => solanaConfig.apiUrl.replace(/\/$/, "");

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!response.ok) {
    throw new FaucetRequestError(
      body?.error ?? `Faucet request failed (${response.status}).`,
      response.status,
      body?.code ?? "faucet_error"
    );
  }
  if (!body) throw new FaucetRequestError("Empty faucet response.", response.status, "faucet_error");
  return body;
}

/**
 * Public faucet config, plus the wallet's own claim state when the player is
 * signed in (the backend keys claims by Privy user and wallet).
 */
export async function fetchFaucetStatus(walletAddress?: string | null): Promise<FaucetStatus> {
  if (!solanaConfig.apiUrl) return { enabled: false };
  const headers: Record<string, string> = {};
  let query = "";
  if (walletAddress) {
    const token = await getAccessToken().catch(() => null);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      query = `?wallet=${encodeURIComponent(walletAddress)}`;
    }
  }
  const response = await fetch(`${apiUrl()}/api/faucet/status${query}`, { headers });
  return parse<FaucetStatus>(response);
}

export async function claimFaucet(walletAddress: string): Promise<FaucetClaimResult> {
  if (!solanaConfig.apiUrl) {
    throw new FaucetRequestError("NEXT_PUBLIC_API_URL is not configured.", 0, "not_configured");
  }
  const token = await getAccessToken();
  if (!token) {
    throw new FaucetRequestError("Your session expired. Sign in again.", 401, "unauthorized");
  }
  const response = await fetch(`${apiUrl()}/api/faucet/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  return parse<FaucetClaimResult>(response);
}

/** Fired on `window` after a successful claim, so balances refetch. */
export const FAUCET_CLAIMED_EVENT = "zug:faucet-claimed";
