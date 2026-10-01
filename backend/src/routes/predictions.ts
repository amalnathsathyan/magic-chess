import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  MovePredictionService,
  PredictionError,
} from "../services/movePredictions.js";
import {
  PredictionSessions,
  predictionSessionMessage,
} from "../services/predictionSession.js";

const WALLET = {
  type: "string",
  minLength: 32,
  maxLength: 44,
  pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
} as const;
const MATCH_PARAMS = {
  type: "object",
  required: ["matchId"],
  properties: { matchId: { type: "string", minLength: 1, maxLength: 32 } },
} as const;

// Per-wallet write limiter (bets/cancels).
const writes = new Map<string, { start: number; count: number }>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of writes) if (entry.start < cutoff) writes.delete(key);
  if (writes.size > 10_000) writes.clear();
}, 60_000).unref();

function allowWrite(wallet: string): boolean {
  const now = Date.now();
  const current = writes.get(wallet);
  if (!current || now - current.start >= 60_000) {
    writes.set(wallet, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

function sendError(reply: FastifyReply, error: unknown, request: FastifyRequest) {
  if (error instanceof PredictionError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  }
  request.log.error({ error }, "Prediction request failed");
  return reply
    .code(503)
    .send({ error: "Predictions are temporarily unavailable.", code: "unavailable" });
}

export function predictionRoutes(
  app: FastifyInstance,
  service: MovePredictionService,
  sessions: PredictionSessions
): void {
  const walletFrom = (request: FastifyRequest): string | null => {
    const header = request.headers.authorization;
    return sessions.verify(header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  };
  const requireWallet = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const wallet = walletFrom(request);
    if (!wallet) {
      void reply
        .code(401)
        .send({ error: "Sign in with your wallet to predict.", code: "unauthorized" });
    }
    return wallet;
  };

  app.get<{ Querystring: { wallet: string } }>(
    "/api/predictions/challenge",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["wallet"],
          properties: { wallet: WALLET },
        },
      },
    },
    async (request) => {
      const issuedAt = Date.now();
      return {
        issuedAt,
        message: predictionSessionMessage(request.query.wallet, issuedAt),
      };
    }
  );

  app.post<{ Body: { wallet: string; issuedAt: number; signature: string } }>(
    "/api/predictions/session",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["wallet", "issuedAt", "signature"],
          properties: {
            wallet: WALLET,
            issuedAt: { type: "integer", minimum: 0 },
            signature: { type: "string", minLength: 80, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const session = sessions.issue(request.body);
        const account = await service.getAccount(request.body.wallet);
        return { ...session, account };
      } catch (error) {
        if (error instanceof Error && !(error instanceof PredictionError)) {
          return reply.code(401).send({ error: error.message, code: "unauthorized" });
        }
        return sendError(reply, error, request);
      }
    }
  );

  app.get("/api/predictions/me", async (request, reply) => {
    const wallet = requireWallet(request, reply);
    if (!wallet) return reply;
    try {
      return {
        account: await service.getAccount(wallet),
        bets: await service.myBets(wallet),
      };
    } catch (error) {
      return sendError(reply, error, request);
    }
  });

  app.get<{ Querystring: { limit?: number } }>(
    "/api/predictions/leaderboard",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
        },
      },
    },
    async (request, reply) => {
      try {
        return { leaderboard: await service.leaderboard(request.query.limit ?? 20) };
      } catch (error) {
        return sendError(reply, error, request);
      }
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/matches/:matchId/predictions",
    { schema: { params: MATCH_PARAMS } },
    async (request, reply) => {
      try {
        const snapshot = await service.snapshot(request.params.matchId);
        const wallet = walletFrom(request);
        return {
          ...snapshot,
          myBets: wallet ? await service.myBets(wallet, request.params.matchId) : [],
        };
      } catch (error) {
        return sendError(reply, error, request);
      }
    }
  );

  app.post<{ Params: { matchId: string }; Body: { ply: number; san: string; stake: number } }>(
    "/api/matches/:matchId/predictions",
    {
      schema: {
        params: MATCH_PARAMS,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["ply", "san", "stake"],
          properties: {
            ply: { type: "integer", minimum: 1, maximum: 1000 },
            san: { type: "string", minLength: 2, maxLength: 12 },
            stake: { type: "integer", minimum: 1, maximum: 1_000_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const wallet = requireWallet(request, reply);
      if (!wallet) return reply;
      if (!allowWrite(wallet)) {
        return reply.code(429).send({ error: "Slow down a little.", code: "rate_limited" });
      }
      try {
        const result = await service.placeBet({
          wallet,
          matchId: request.params.matchId,
          ...request.body,
        });
        return {
          ...result,
          myBets: await service.myBets(wallet, request.params.matchId),
        };
      } catch (error) {
        return sendError(reply, error, request);
      }
    }
  );

  app.delete<{ Params: { matchId: string; ply: number } }>(
    "/api/matches/:matchId/predictions/:ply",
    {
      schema: {
        params: {
          type: "object",
          required: ["matchId", "ply"],
          properties: {
            matchId: { type: "string", minLength: 1, maxLength: 32 },
            ply: { type: "integer", minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      const wallet = requireWallet(request, reply);
      if (!wallet) return reply;
      if (!allowWrite(wallet)) {
        return reply.code(429).send({ error: "Slow down a little.", code: "rate_limited" });
      }
      try {
        const result = await service.cancelBet({
          wallet,
          matchId: request.params.matchId,
          ply: request.params.ply,
        });
        return {
          ...result,
          myBets: await service.myBets(wallet, request.params.matchId),
        };
      } catch (error) {
        return sendError(reply, error, request);
      }
    }
  );
}
