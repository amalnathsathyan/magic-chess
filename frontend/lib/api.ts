/**
 * Backend API client — thin fetch wrapper.
 * Uses the read-only indexer configured by NEXT_PUBLIC_API_URL.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function getApiUrl(path: string): string {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured for this deployment.");
  }
  return new URL(path, API_URL).toString();
}

async function fetchApi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured for this deployment.");
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Types ──

export interface ApiMatch {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  gameStatus: string;
  gameEndReason: string | null;
  totalPot: string;
  bettingTokenMint: string;
  moveTimeoutSeconds: string;
  createdAt: string;
  lastMoveAt: string;
  boardFen: string | null;
  moveCount: number;
}

export interface ApiMatchDetail extends ApiMatch {
  betAmountPerPlayer: string;
  platformFeeBps: number;
  currentTurn: string | null;
  startedAt: string | null;
  endedAt: string | null;
  payoutProcessed: boolean;
}

export interface ApiMove {
  moveNumber: number;
  playerColor: string;
  playerPubkey: string;
  algebraicMove: string;
  from: string;
  to: string;
  fenAfter: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
}

export interface ApiMatchHistory {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  moves: ApiMove[];
  totalMoves: number;
}

export interface ApiPlayerStats {
  playerPubkey: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  winsByCheckmate: number;
  winsByResignation: number;
  winsByTimeout: number;
  currentStreak: number;
  longestWinStreak: number;
  totalWagered: string;
  totalWon: string;
  lastGameAt: string | null;
}

export interface ApiLeaderboardEntry {
  rank: number;
  playerPubkey: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  longestWinStreak: number;
}

export interface ApiPaginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
}

export interface ApiRealtimeSnapshot {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  gameStatus: string;
  gameEndReason: string | null;
  bettingTokenMint: string;
  betAmountPerPlayer: string;
  totalPot: string;
  moveTimeoutSeconds: string;
  currentFen: string;
  currentTurn: "white" | "black" | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastMoveAt: string;
  payoutProcessed: boolean;
  moveCount: number;
}

export interface ApiMatchClock {
  serverTime: string;
  activeColor: "white" | "black" | null;
  deadlineAt: string | null;
  remainingMs: number | null;
  expired: boolean;
  authority: "confirmed-chain-index";
}

export interface ApiRealtimeSession {
  token: string;
  clientId: string;
  role: "white" | "black" | "spectator";
  expiresAt: string;
  eventUrl: string;
  snapshot: ApiRealtimeSnapshot;
}

// ── API ──

export const api = {
  // Health
  health: () => fetchApi<{ status: string }>("/api/health"),

  // Matches
  listMatches: (params?: {
    status?: string;
    player?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.player) qs.set("player", params.player);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return fetchApi<{
      matches: ApiMatch[];
      pagination: { page: number; limit: number; total: number };
    }>(`/api/matches${query ? `?${query}` : ""}`);
  },

  getMatch: (matchId: string) =>
    fetchApi<ApiMatchDetail>(`/api/matches/${matchId}`),

  getMatchHistory: (matchId: string) =>
    fetchApi<ApiMatchHistory>(`/api/matches/${matchId}/history`),

  createRealtimeSession: (
    matchId: string,
    body: {
      clientId: string;
      wallet?: string;
      issuedAt?: number;
      signature?: string;
    }
  ) =>
    fetchApi<ApiRealtimeSession>(
      `/api/realtime/matches/${encodeURIComponent(matchId)}/session`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  getRealtimeChallenge: (matchId: string, wallet: string) => {
    const query = new URLSearchParams({ wallet });
    return fetchApi<{ issuedAt: number; message: string }>(
      `/api/realtime/matches/${encodeURIComponent(matchId)}/challenge?${query}`
    );
  },

  // Players
  getPlayerStats: (pubkey: string) =>
    fetchApi<ApiPlayerStats>(`/api/players/${pubkey}/stats`),

  getPlayerMatches: (
    pubkey: string,
    params?: { page?: number; limit?: number; status?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    return fetchApi<{
      matches: Array<ApiMatch & { playerColor: string }>;
      pagination: { page: number; limit: number; total: number };
    }>(`/api/players/${pubkey}/matches${query ? `?${query}` : ""}`);
  },

  // Leaderboard
  getLeaderboard: (params?: { sortBy?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.sortBy) qs.set("sortBy", params.sortBy);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return fetchApi<{
      leaderboard: ApiLeaderboardEntry[];
      sortBy: string;
    }>(`/api/leaderboard${query ? `?${query}` : ""}`);
  },

};
