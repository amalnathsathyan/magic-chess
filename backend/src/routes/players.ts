import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";
import {
  AVATARS,
  BIO_MAX_LENGTH,
  ProfileError,
  loadPlayerProfile,
  normalizeProfileEdit,
  profileUpdateMessage,
  saveProfile,
} from "../services/profiles.js";
import { INITIAL_RATING } from "../services/rating.js";
import {
  isFreshPlayerProof,
  verifySolanaMessageSignature,
} from "../services/walletProof.js";

interface PlayerQuery {
  page?: number;
  limit?: number;
  status?: string;
  result?: "win" | "loss" | "draw";
}

const WALLET_PARAMS = {
  type: "object",
  required: ["pubkey"],
  properties: {
    pubkey: { type: "string", minLength: 32, maxLength: 44, pattern: "^[1-9A-HJ-NP-Za-km-z]+$" },
  },
} as const;

const PROFILE_FIELDS = {
  displayName: { type: ["string", "null"], maxLength: 40 },
  bio: { type: ["string", "null"], maxLength: BIO_MAX_LENGTH * 2 },
  avatar: { type: ["string", "null"], enum: [...AVATARS, "", null] },
} as const;

interface ProfileBody {
  displayName?: string | null;
  bio?: string | null;
  avatar?: string | null;
}

// Per-wallet limiter for profile writes.
const profileWrites = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, times] of profileWrites) {
    if (times.every((time) => time < cutoff)) profileWrites.delete(key);
  }
}, 60_000).unref();

function allowProfileWrite(wallet: string): boolean {
  const now = Date.now();
  const recent = (profileWrites.get(wallet) ?? []).filter((time) => time > now - 60_000);
  recent.push(now);
  profileWrites.set(wallet, recent);
  return recent.length <= 10;
}

export function playerRoutes(app: FastifyInstance): void {
  // ── Player stats ──
  app.get<{ Params: { pubkey: string } }>(
    "/api/players/:pubkey/stats",
    async (request, reply) => {
      const { pubkey } = request.params;

      const rows = await sql`
        SELECT * FROM player_stats WHERE player_pubkey = ${pubkey}
      `;

      if (rows.length === 0) {
        return reply.send({
          playerPubkey: pubkey,
          totalGames: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          winsByCheckmate: 0,
          winsByResignation: 0,
          winsByTimeout: 0,
          currentStreak: 0,
          longestWinStreak: 0,
          totalWagered: "0",
          totalWon: "0",
          lastGameAt: null,
          rating: INITIAL_RATING,
          peakRating: INITIAL_RATING,
          ratedGames: 0,
        });
      }

      const s = rows[0] as Record<string, unknown>;
      const total = Number(s.totalGames) || 0;
      const wins = Number(s.wins) || 0;

      reply.send({
        playerPubkey: s.playerPubkey,
        totalGames: total,
        wins,
        losses: Number(s.losses) || 0,
        draws: Number(s.draws) || 0,
        winRate: total > 0 ? wins / total : 0,
        winsByCheckmate: Number(s.winsByCheckmate) || 0,
        winsByResignation: Number(s.winsByResignation) || 0,
        winsByTimeout: Number(s.winsByTimeout) || 0,
        currentStreak: Number(s.currentStreak) || 0,
        longestWinStreak: Number(s.longestWinStreak) || 0,
        totalWagered: String(s.totalWagered ?? "0"),
        totalWon: String(s.totalWon ?? "0"),
        lastGameAt: s.lastGameAt ?? null,
        rating: Number(s.rating ?? INITIAL_RATING),
        peakRating: Number(s.peakRating ?? INITIAL_RATING),
        ratedGames: Number(s.ratedGames ?? 0),
      });
    }
  );

  // ── Player match history ──
  app.get<{ Params: { pubkey: string }; Querystring: PlayerQuery }>(
    "/api/players/:pubkey/matches",
    async (request, reply) => {
      const { pubkey } = request.params;
      const { page = 1, limit = 20, status, result } = request.query;

      const offset = (page - 1) * Math.min(limit, 100);
      const effectiveLimit = Math.min(limit, 100);

      // Parameterized query — same pattern as matches.ts
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      conditions.push(
        `(white_player = $${params.length + 1} OR black_player = $${params.length + 1})`
      );
      params.push(pubkey);

      if (status) {
        if (status === "Completed") {
          conditions.push(
            `game_status IN ('WhiteWins', 'BlackWins', 'Draw')`
          );
        } else {
          conditions.push(`game_status = $${params.length + 1}`);
          params.push(status);
        }
      }
      if (result === "draw") {
        conditions.push(`game_status = 'Draw'`);
      } else if (result === "win" || result === "loss") {
        const won = result === "win";
        conditions.push(
          `((game_status = 'WhiteWins' AND white_player ${won ? "=" : "<>"} $1) OR ` +
            `(game_status = 'BlackWins' AND black_player ${won ? "=" : "<>"} $1))`
        );
      }
      const where = `WHERE ${conditions.join(" AND ")}`;

      const countResult = await sql.unsafe(
        `SELECT COUNT(*) as total FROM matches ${where}`,
        params
      );
      const total = Number(countResult[0]?.total ?? 0);

      const rows = await sql.unsafe(
        `SELECT
          match_id, white_player, black_player, game_status,
          game_end_reason, total_pot, betting_token_mint,
          bet_amount_per_player, move_timeout_seconds, current_fen,
          created_at, ended_at, last_move_at,
          white_rating, black_rating, white_rating_change, black_rating_change,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = matches.white_player) AS white_name,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = matches.black_player) AS black_name,
          (SELECT COUNT(*) FROM moves WHERE moves.match_id = matches.match_id) AS move_count
        FROM matches
        ${where}
        ORDER BY COALESCE(ended_at, last_move_at, created_at) DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, effectiveLimit, offset]
      );

      reply.send({
        matches: rows.map((m: Record<string, unknown>) => ({
          matchId: m.matchId,
          whitePlayer: m.whitePlayer,
          blackPlayer: m.blackPlayer,
          gameStatus: m.gameStatus,
          gameEndReason: m.gameEndReason,
          totalPot: String(m.totalPot ?? "0"),
          bettingTokenMint: m.bettingTokenMint,
          betAmountPerPlayer: String(m.betAmountPerPlayer ?? "0"),
          moveTimeoutSeconds: String(m.moveTimeoutSeconds ?? "0"),
          boardFen: m.currentFen ?? null,
          createdAt: m.createdAt,
          endedAt: m.endedAt,
          lastMoveAt: m.lastMoveAt,
          moveCount: Number(m.moveCount ?? 0),
          whiteName: m.whiteName ?? null,
          blackName: m.blackName ?? null,
          whiteRating: m.whiteRating ?? null,
          blackRating: m.blackRating ?? null,
          whiteRatingChange: m.whiteRatingChange ?? null,
          blackRatingChange: m.blackRatingChange ?? null,
          playerColor:
            m.whitePlayer === pubkey ? "white" : "black",
        })),
        pagination: { page, limit: effectiveLimit, total },
      });
    }
  );

  // ── Public profile: identity, rating, breakdowns ──
  app.get<{ Params: { pubkey: string } }>(
    "/api/players/:pubkey/profile",
    { schema: { params: WALLET_PARAMS } },
    async (request) => loadPlayerProfile(request.params.pubkey)
  );

  // ── Profile edits: the wallet signs the exact new values ──
  app.post<{ Params: { pubkey: string }; Body: ProfileBody }>(
    "/api/players/:pubkey/profile/challenge",
    {
      schema: {
        params: WALLET_PARAMS,
        body: { type: "object", additionalProperties: false, properties: PROFILE_FIELDS },
      },
    },
    async (request, reply) => {
      try {
        const edit = normalizeProfileEdit(request.body ?? {});
        const issuedAt = Date.now();
        return {
          issuedAt,
          message: profileUpdateMessage(request.params.pubkey, edit, issuedAt),
        };
      } catch (error) {
        if (error instanceof ProfileError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  app.put<{
    Params: { pubkey: string };
    Body: ProfileBody & { issuedAt: number; signature: string };
  }>(
    "/api/players/:pubkey/profile",
    {
      schema: {
        params: WALLET_PARAMS,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["issuedAt", "signature"],
          properties: {
            ...PROFILE_FIELDS,
            issuedAt: { type: "integer", minimum: 0 },
            signature: { type: "string", minLength: 80, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const wallet = request.params.pubkey;
      const { issuedAt, signature, ...fields } = request.body;
      try {
        if (!allowProfileWrite(wallet)) {
          return reply.code(429).send({ error: "Too many profile updates. Try again in a minute." });
        }
        const edit = normalizeProfileEdit(fields);
        if (!isFreshPlayerProof(issuedAt)) {
          return reply.code(401).send({ error: "The signature expired. Save again." });
        }
        const message = profileUpdateMessage(wallet, edit, issuedAt);
        if (!verifySolanaMessageSignature(wallet, message, signature)) {
          return reply.code(401).send({ error: "The wallet signature didn't match." });
        }
        await saveProfile(wallet, edit);
        return loadPlayerProfile(wallet);
      } catch (error) {
        if (error instanceof ProfileError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}
