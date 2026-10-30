import type { FastifyInstance } from "fastify";
import {
  RewardError,
  claimReward,
  rewardClaimMessage,
  rewardSettings,
  rewardStatus,
} from "../services/zugconRewards.js";

const MATCH_PARAMS = {
  type: "object",
  required: ["matchId"],
  properties: { matchId: { type: "string", minLength: 1, maxLength: 32 } },
} as const;

const WALLET = {
  type: "string",
  minLength: 32,
  maxLength: 44,
  pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
} as const;

// Per-wallet limiter for claim attempts (each one costs chain reads).
const attempts = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, times] of attempts) {
    if (times.every((time) => time < cutoff)) attempts.delete(key);
  }
}, 60_000).unref();

function allowAttempt(wallet: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(wallet) ?? []).filter((time) => time > now - 60_000);
  recent.push(now);
  attempts.set(wallet, recent);
  return recent.length <= 6;
}

/**
 * ZUGCON reward claims for finished games.
 *   GET  /api/rewards                                   what's on offer (for banners)
 *   GET  /api/rewards/matches/:matchId?wallet=           eligibility + claim state
 *   GET  /api/rewards/matches/:matchId/challenge?wallet= message to sign
 *   POST /api/rewards/matches/:matchId/claim             { wallet, issuedAt, signature }
 */
export function rewardRoutes(app: FastifyInstance): void {
  app.get("/api/rewards", async () => {
    const s = rewardSettings();
    return {
      enabled: s.enabled,
      mint: s.enabled ? s.mint : null,
      symbol: s.symbol,
      decimals: s.decimals,
      creatorAmount: s.creatorAmount,
      joinerAmount: s.joinerAmount,
      minPlies: s.minPlies,
      dailyGamesPerWallet: s.dailyGamesPerWallet,
      dailyGamesPerPair: s.dailyGamesPerPair,
    };
  });

  app.get<{ Params: { matchId: string }; Querystring: { wallet?: string } }>(
    "/api/rewards/matches/:matchId",
    {
      schema: {
        params: MATCH_PARAMS,
        querystring: { type: "object", properties: { wallet: WALLET } },
      },
    },
    async (request) => rewardStatus(request.params.matchId, request.query.wallet ?? null)
  );

  app.get<{ Params: { matchId: string }; Querystring: { wallet: string } }>(
    "/api/rewards/matches/:matchId/challenge",
    {
      schema: {
        params: MATCH_PARAMS,
        querystring: { type: "object", required: ["wallet"], properties: { wallet: WALLET } },
      },
    },
    async (request) => {
      const issuedAt = Date.now();
      return {
        issuedAt,
        message: rewardClaimMessage(request.params.matchId, request.query.wallet, issuedAt),
      };
    }
  );

  app.post<{
    Params: { matchId: string };
    Body: { wallet: string; issuedAt: number; signature: string };
  }>(
    "/api/rewards/matches/:matchId/claim",
    {
      schema: {
        params: MATCH_PARAMS,
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
      const { wallet, issuedAt, signature } = request.body;
      if (!allowAttempt(wallet)) {
        return reply.code(429).send({ error: "Too many claim attempts. Try again in a minute.", code: "rate_limited" });
      }
      try {
        const claim = await claimReward({ matchId: request.params.matchId, wallet, issuedAt, signature });
        return reply.code(200).send({ claim });
      } catch (error) {
        const rewardError =
          error instanceof RewardError
            ? error
            : new RewardError(error instanceof Error ? error.message : "Claim failed", 500, "reward_error");
        request.log.warn(
          { code: rewardError.code, error: rewardError.message, matchId: request.params.matchId },
          "ZUGCON claim rejected"
        );
        return reply.code(rewardError.statusCode).send({ error: rewardError.message, code: rewardError.code });
      }
    }
  );
}
