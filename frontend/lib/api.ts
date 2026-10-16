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
  betAmountPerPlayer?: string;
  /** Open move predictions spectators have placed on this match. */
  openPredictions?: number;
  /**
   * The side to move ran out of time (plus a grace period) and the game is
   * waiting for the other side to claim the win.
   */
  timedOut?: boolean;
  timedOutSide?: "white" | "black" | null;
  /** When the side to move runs out of time; null when untimed. */
  timeoutAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  whiteName?: string | null;
  blackName?: string | null;
  /** Ratings going into the game and what each side gained or lost. */
  whiteRating?: number | null;
  blackRating?: number | null;
  whiteRatingChange?: number | null;
  blackRatingChange?: number | null;
  /** XP each side earned from the game. */
  whiteXp?: number | null;
  blackXp?: number | null;
}

export interface ApiPlayerMatch extends ApiMatch {
  playerColor: "white" | "black";
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
  /** Standard algebraic notation, derived server-side (falls back to UCI). */
  san?: string;
  playerColor: string;
  playerPubkey: string;
  algebraicMove: string;
  from: string;
  to: string;
  fenAfter: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  /** When the move was confirmed on chain (falls back to when it was indexed). */
  playedAt?: string | null;
}

export interface ApiHistorySide {
  name: string | null;
  avatar: string | null;
  rating: number | null;
  ratingChange: number | null;
  xp?: number | null;
}

export interface ApiMatchHistory {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  gameStatus: string;
  gameEndReason: string | null;
  bettingTokenMint: string;
  betAmountPerPlayer: string;
  totalPot: string;
  moveTimeoutSeconds: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  payoutProcessed: boolean;
  finalFen: string | null;
  white: ApiHistorySide;
  black: ApiHistorySide;
  moves: ApiMove[];
  totalMoves: number;
  /** Half-moves in the game; above totalMoves when some moves weren't recorded. */
  plyCount?: number;
  movesComplete?: boolean;
}

export type ApiTier = "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";

export interface ApiLevel {
  xp: number;
  level: number;
  tier: ApiTier;
  /** XP earned inside the current level, out of levelSpan. */
  levelXp: number;
  levelSpan: number;
}

export type ApiOutcome = "win" | "loss" | "draw";

export interface ApiTally {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface ApiPlayerProfile {
  wallet: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  memberSince: string | null;
  rating: number;
  peakRating: number;
  ratedGames: number;
  provisional: boolean;
  rank: number | null;
  xp?: ApiLevel;
  recentXp?: Array<{ matchId: string; amount: number; earnedAt: string | null; kinds: string[] }>;
  activeGames: number;
  stats: {
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    currentStreak: number;
    longestWinStreak: number;
    totalWagered: string;
    totalWon: string;
    lastGameAt: string | null;
  };
  byColor: { white: ApiTally; black: ApiTally };
  endings: Array<{ outcome: ApiOutcome; reason: string; count: number }>;
  openings: {
    white: Array<ApiTally & { move: string }>;
    black: Array<ApiTally & { move: string }>;
  };
  ratingHistory: Array<{ matchId: string; endedAt: string | null; rating: number }>;
  recentForm: Array<{ matchId: string; result: ApiOutcome }>;
}

export interface ApiProfileEdit {
  displayName: string;
  bio: string;
  avatar: string;
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
  rating?: number;
  peakRating?: number;
  ratedGames?: number;
  xp?: number;
  level?: number;
  tier?: ApiTier;
  displayName?: string | null;
  avatar?: string | null;
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
    /** true: only timed-out games; false: leave them out. */
    timedOut?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.player) qs.set("player", params.player);
    if (params?.timedOut !== undefined) qs.set("timedOut", String(params.timedOut));
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

  getPlayerProfile: (pubkey: string) =>
    fetchApi<ApiPlayerProfile>(`/api/players/${pubkey}/profile`),

  profileChallenge: (pubkey: string, edit: ApiProfileEdit) =>
    fetchApi<{ issuedAt: number; message: string }>(
      `/api/players/${pubkey}/profile/challenge`,
      { method: "POST", body: JSON.stringify(edit) }
    ),

  saveProfile: (
    pubkey: string,
    body: ApiProfileEdit & { issuedAt: number; signature: string }
  ) =>
    fetchApi<ApiPlayerProfile>(`/api/players/${pubkey}/profile`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getPlayerMatches: (
    pubkey: string,
    params?: { page?: number; limit?: number; status?: string; result?: ApiOutcome }
  ) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.result) qs.set("result", params.result);
    const query = qs.toString();
    return fetchApi<{
      matches: ApiPlayerMatch[];
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
