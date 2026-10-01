/**
 * Client for live move predictions (play points, no SOL involved).
 */
import { solanaConfig } from "@/lib/solana-config";

export interface PredictionAccount {
  wallet: string;
  balance: number;
  totalStaked: number;
  totalWon: number;
  betsWon: number;
  betsLost: number;
}

export interface MarketOption {
  san: string;
  stake: number;
  bettors: number;
}

export interface PlyMarket {
  ply: number;
  status: "open" | "settled" | "void";
  pool: number;
  bettors: number;
  options: MarketOption[];
  actualSan: string | null;
}

export interface MarketSnapshot {
  matchId: string;
  pliesPlayed: number;
  nextPly: number;
  maxPly: number;
  open: boolean;
  markets: PlyMarket[];
}

export interface MyBet {
  matchId: string;
  ply: number;
  predictedSan: string;
  stake: number;
  status: "open" | "won" | "lost" | "refunded";
  payout: number;
  createdAt: string;
}

export interface SettledEvent {
  ply: number;
  actualSan: string | null;
  winners: Array<{ wallet: string; payout: number }>;
  losers: number;
  refunded: number;
}

export class PredictionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "PredictionApiError";
  }
}

const base = () => solanaConfig.apiUrl.replace(/\/$/, "");

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {}
): Promise<T> {
  if (!solanaConfig.apiUrl) {
    throw new PredictionApiError("Predictions need the game server, which isn't configured.", 503);
  }
  const { token, ...rest } = init;
  const response = await fetch(`${base()}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!response.ok) {
    throw new PredictionApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.code
    );
  }
  return body as T;
}

export const predictionsApi = {
  challenge: (wallet: string) =>
    request<{ issuedAt: number; message: string }>(
      `/api/predictions/challenge?wallet=${encodeURIComponent(wallet)}`
    ),
  session: (body: { wallet: string; issuedAt: number; signature: string }) =>
    request<{ token: string; expiresAt: number; account: PredictionAccount }>(
      "/api/predictions/session",
      { method: "POST", body: JSON.stringify(body) }
    ),
  me: (token: string) =>
    request<{ account: PredictionAccount; bets: MyBet[] }>("/api/predictions/me", { token }),
  market: (matchId: string, token?: string | null) =>
    request<MarketSnapshot & { myBets: MyBet[] }>(
      `/api/matches/${encodeURIComponent(matchId)}/predictions`,
      { token }
    ),
  place: (
    matchId: string,
    token: string,
    body: { ply: number; san: string; stake: number }
  ) =>
    request<{ account: PredictionAccount; snapshot: MarketSnapshot; myBets: MyBet[] }>(
      `/api/matches/${encodeURIComponent(matchId)}/predictions`,
      { method: "POST", token, body: JSON.stringify(body) }
    ),
  cancel: (matchId: string, token: string, ply: number) =>
    request<{ account: PredictionAccount; snapshot: MarketSnapshot; myBets: MyBet[] }>(
      `/api/matches/${encodeURIComponent(matchId)}/predictions/${ply}`,
      { method: "DELETE", token }
    ),
  leaderboard: () =>
    request<{
      leaderboard: Array<{
        rank: number;
        wallet: string;
        balance: number;
        totalWon: number;
        betsWon: number;
        betsLost: number;
      }>;
    }>("/api/predictions/leaderboard"),
};

/** Implied payout multiplier for a winning pick (parimutuel, before odds move). */
export function impliedMultiplier(market: PlyMarket | undefined, san: string, stake: number): number {
  const pool = (market?.pool ?? 0) + stake;
  const onPick = (market?.options.find((o) => o.san === san)?.stake ?? 0) + stake;
  if (onPick <= 0 || pool <= onPick) return 1;
  return pool / onPick;
}
