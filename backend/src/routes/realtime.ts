import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { sql } from "../db/pool.js";
import type {
  MatchRealtimeHub,
  RealtimeEvent,
} from "../services/matchRealtime.js";
import { RealtimeCapacityError } from "../services/matchRealtime.js";
import { loadMatchRealtimeSnapshot } from "../services/matchSnapshot.js";
import {
  isFreshPlayerProof,
  playerSessionMessage,
  verifyPlayerSessionSignature,
} from "../services/walletProof.js";

interface MatchParams {
  matchId: string;
}

interface ChallengeQuery {
  wallet: string;
}

interface SessionBody {
  wallet?: string;
  issuedAt?: number;
  signature?: string;
  clientId?: string;
}

interface EventQuery {
  session: string;
}

interface LobbyQuery {
  limit?: number;
}

const paramsSchema = {
  type: "object",
  required: ["matchId"],
  properties: {
    matchId: { type: "string", minLength: 1, maxLength: 32 },
  },
} as const;

const SESSION_RATE_WINDOW_MS = 60_000;
const SESSION_RATE_LIMIT = 60;
const SESSION_RATE_KEYS_MAX = 4_096;

function validMatchId(matchId: string): boolean {
  return Buffer.byteLength(matchId, "utf8") <= 32;
}

function sse(event: RealtimeEvent): string {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function realtimeRoutes(
  app: FastifyInstance,
  realtime: MatchRealtimeHub
): void {
  const sessionRates = new Map<string, { startedAt: number; count: number }>();
  let lastRateSweep = 0;

  const allowSessionRequest = (key: string, now: number): boolean => {
    if (now - lastRateSweep >= SESSION_RATE_WINDOW_MS) {
      for (const [candidate, rate] of sessionRates) {
        if (now - rate.startedAt >= SESSION_RATE_WINDOW_MS) {
          sessionRates.delete(candidate);
        }
      }
      lastRateSweep = now;
    }
    const current = sessionRates.get(key);
    if (!current || now - current.startedAt >= SESSION_RATE_WINDOW_MS) {
      if (!current && sessionRates.size >= SESSION_RATE_KEYS_MAX) return false;
      sessionRates.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= SESSION_RATE_LIMIT) return false;
    current.count += 1;
    return true;
  };

  app.get<{ Querystring: LobbyQuery }>(
    "/api/lobbies",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const limit = Math.min(request.query.limit ?? 50, 100);
      const rows = await sql`
        SELECT
          match_id, white_player, betting_token_mint, bet_amount_per_player,
          total_pot, move_timeout_seconds, created_at
        FROM matches
        WHERE game_status = 'WaitingForOpponent'
          AND black_player IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return reply.send({
        source: "confirmed-chain-index",
        lobbies: rows.map((row: Record<string, unknown>) => ({
          matchId: row.matchId,
          creator: row.whitePlayer,
          bettingTokenMint: row.bettingTokenMint,
          betAmountPerPlayer: String(row.betAmountPerPlayer ?? "0"),
          totalPot: String(row.totalPot ?? "0"),
          moveTimeoutSeconds: String(row.moveTimeoutSeconds ?? "0"),
          createdAt: row.createdAt,
          sharePath: `/play/${encodeURIComponent(String(row.matchId))}`,
        })),
      });
    }
  );

  app.get<{ Params: MatchParams; Querystring: ChallengeQuery }>(
    "/api/realtime/matches/:matchId/challenge",
    {
      schema: {
        params: paramsSchema,
        querystring: {
          type: "object",
          required: ["wallet"],
          properties: {
            wallet: { type: "string", minLength: 32, maxLength: 44 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!allowSessionRequest(request.ip, Date.now())) {
        return reply.code(429).send({ error: "Realtime session rate limit exceeded" });
      }
      const { matchId } = request.params;
      const { wallet } = request.query;
      if (!validMatchId(matchId)) {
        return reply.code(400).send({ error: "matchId exceeds 32 UTF-8 bytes" });
      }
      try {
        new PublicKey(wallet);
      } catch {
        return reply.code(400).send({ error: "Invalid Solana wallet address" });
      }
      const snapshot = await loadMatchRealtimeSnapshot(matchId);
      if (!snapshot) return reply.code(404).send({ error: "Match not found" });
      if (wallet !== snapshot.whitePlayer && wallet !== snapshot.blackPlayer) {
        return reply.code(403).send({ error: "Wallet is not a player in this match" });
      }
      const issuedAt = Date.now();
      return reply.send({
        issuedAt,
        message: playerSessionMessage(matchId, wallet, issuedAt),
      });
    }
  );

  app.post<{ Params: MatchParams; Body: SessionBody }>(
    "/api/realtime/matches/:matchId/session",
    {
      schema: {
        params: paramsSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            wallet: { type: "string", minLength: 32, maxLength: 44 },
            issuedAt: { type: "integer", minimum: 0 },
            signature: { type: "string", minLength: 80, maxLength: 100 },
            clientId: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!allowSessionRequest(request.ip, Date.now())) {
        return reply.code(429).send({ error: "Realtime session rate limit exceeded" });
      }
      const { matchId } = request.params;
      if (!validMatchId(matchId)) {
        return reply.code(400).send({ error: "matchId exceeds 32 UTF-8 bytes" });
      }
      const snapshot = await loadMatchRealtimeSnapshot(matchId);
      if (!snapshot) return reply.code(404).send({ error: "Match not found" });

      const { wallet, issuedAt, signature, clientId } = request.body;
      if (wallet) {
        if (wallet !== snapshot.whitePlayer && wallet !== snapshot.blackPlayer) {
          return reply.code(403).send({ error: "Wallet is not a player in this match" });
        }
        if (
          issuedAt === undefined ||
          !signature ||
          !isFreshPlayerProof(issuedAt) ||
          !verifyPlayerSessionSignature({
            matchId,
            wallet,
            issuedAt,
            signature,
          })
        ) {
          return reply.code(401).send({ error: "Invalid or expired player signature" });
        }
      }

      let session;
      try {
        session = realtime.createSession({ snapshot, wallet, clientId });
      } catch (error) {
        if (error instanceof RealtimeCapacityError) {
          return reply.code(429).send({ error: error.message });
        }
        throw error;
      }
      return reply.send({
        ...session,
        eventUrl: `/api/realtime/matches/${encodeURIComponent(matchId)}/events?session=${encodeURIComponent(session.token)}`,
        snapshot,
      });
    }
  );

  app.get<{ Params: MatchParams; Querystring: EventQuery }>(
    "/api/realtime/matches/:matchId/events",
    {
      schema: {
        params: paramsSchema,
        querystring: {
          type: "object",
          required: ["session"],
          properties: {
            session: { type: "string", minLength: 32, maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const { matchId } = request.params;
      if (!validMatchId(matchId)) {
        return reply.code(400).send({ error: "matchId exceeds 32 UTF-8 bytes" });
      }
      if (!realtime.hasSession(matchId, request.query.session)) {
        return reply.code(401).send({ error: "Realtime session is invalid or expired" });
      }

      reply.hijack();
      request.raw.socket.setKeepAlive(true);
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write("retry: 2000\n\n");

      const lastHeader = request.headers["last-event-id"];
      const lastEventId = Array.isArray(lastHeader) ? lastHeader[0] : lastHeader;
      const subscription = realtime.subscribe({
        matchId,
        token: request.query.session,
        lastEventId,
        send: (event) => reply.raw.write(sse(event)),
        close: () => {
          if (!reply.raw.writableEnded) reply.raw.end();
        },
      });
      if (!subscription) return reply.raw.end();

      const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
      heartbeat.unref();
      request.raw.once("close", () => {
        clearInterval(heartbeat);
        subscription.disconnect();
      });
    }
  );
}
