/**
 * Backend API client — thin fetch wrapper.
 * Uses NEXT_PUBLIC_API_URL env var (defaults to localhost:3001).
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchApi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
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
  moveTimeoutSeconds: number;
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

  // Sync (frontend reports on-chain events to backend)
  syncMatchCreated: (payload: {
    matchId: string;
    creator: string;
    bettingTokenMint: string;
    betAmount: number;
    moveTimeoutDuration: number;
    platformFeeBasisPoints: number;
    signature: string;
    slot: number;
  }) =>
    fetchApi<{ ok: boolean; fen: string }>("/api/sync/match-created", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  syncPlayerJoined: (payload: {
    matchId: string;
    playerTwo: string;
    betAmountPerPlayer: number;
    signature: string;
    slot: number;
  }) =>
    fetchApi<{ ok: boolean }>("/api/sync/player-joined", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  syncMoveMade: (payload: {
    matchId: string;
    player: string;
    playerColor: string;
    algebraicMove: string;
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    promotionPiece: string | null;
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    signature: string;
    slot: number;
  }) =>
    fetchApi<{ ok: boolean; fen: string; moveNumber: number }>(
      "/api/sync/move-made",
      { method: "POST", body: JSON.stringify(payload) }
    ),

  syncGameEnded: (payload: {
    matchId: string;
    status: string;
    winner: string | null;
    reason: string;
    signature: string;
    slot: number;
  }) =>
    fetchApi<{ ok: boolean }>("/api/sync/game-ended", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  syncPayout: (payload: {
    matchId: string;
    signature: string;
    slot: number;
  }) =>
    fetchApi<{ ok: boolean }>("/api/sync/payout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
