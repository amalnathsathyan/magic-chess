/**
 * Devnet ZUG faucet routes. Devnet only; remove with `services/faucet.ts`
 * when the app moves to mainnet.
 *
 *   GET  /api/faucet/status[?wallet=…]  public config (+ the wallet's claim
 *                                       state when a Privy token is sent)
 *   POST /api/faucet/claim              pay the wallet's next claim
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { sql } from "../db/pool.js";
import { FaucetError, FaucetService } from "../services/faucet.js";
import { SponsorError } from "../services/solanaSponsor.js";
import { SponsorBudget, SponsorBudgetError } from "../services/sponsorBudget.js";
import { bearerToken, verifyRequestToken } from "./transactions.js";

const WALLET_PATTERN = "^[1-9A-HJ-NP-Za-km-z]{32,44}$";

const claimBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["walletAddress"],
  properties: {
    walletAddress: { type: "string", pattern: WALLET_PATTERN },
  },
} as const;

const statusQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    wallet: { type: "string", pattern: WALLET_PATTERN },
  },
} as const;

let service: FaucetService | null | undefined;

function faucet(): FaucetService | null {
  if (service !== undefined) return service;
  if (!FaucetService.isConfigured(config.faucet)) {
    service = null;
    return service;
  }
  service = new FaucetService(config.solana.rpcEndpoint, {
    ...config.faucet,
    feePayerPrivateKey: config.sponsor.feePayerPrivateKey,
    feePayerAddress: config.sponsor.feePayerAddress,
  });
  return service;
}

/** For tests: use this service instead of building one from the config. */
export function setFaucetServiceForTests(instance: FaucetService | null | undefined): void {
  service = instance;
}

async function requireUser(request: FastifyRequest): Promise<string> {
  const claims = await verifyRequestToken(bearerToken(request.headers.authorization));
  return claims.userId;
}

function errorResponse(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof FaucetError || error instanceof SponsorError) {
    return { status: error.statusCode, body: { error: error.message, code: error.code } };
  }
  if (error instanceof SponsorBudgetError) {
    return { status: 429, body: { error: error.message, code: "rate_limited" } };
  }
  return {
    status: 500,
    body: { error: error instanceof Error ? error.message : "Faucet request failed", code: "faucet_error" },
  };
}

export function faucetRoutes(app: FastifyInstance): void {
  const budget = new SponsorBudget({
    requestsPerMinute: config.faucet.requestsPerMinute,
    costlyPerHour: Number.MAX_SAFE_INTEGER,
    hourlyBudgetLamports: BigInt(Number.MAX_SAFE_INTEGER),
  });
  const sweep = setInterval(() => budget.sweep(), 60_000);
  sweep.unref();
  app.addHook("onClose", async () => clearInterval(sweep));

  app.get<{ Querystring: { wallet?: string } }>(
    "/api/faucet/status",
    { schema: { querystring: statusQuerySchema } },
    async (request, reply) => {
      const instance = faucet();
      if (!instance) return reply.send({ enabled: false });
      try {
        const status = await instance.publicStatus();
        const wallet = request.query.wallet;
        if (!wallet || !request.headers.authorization) return reply.send(status);
        const userId = await requireUser(request);
        const you = await instance.walletStatus(sql, wallet, userId);
        return reply.send({ ...status, wallet: you });
      } catch (error) {
        const { status, body } = errorResponse(error);
        return reply.code(status).send(body);
      }
    }
  );

  app.post<{ Body: { walletAddress: string } }>(
    "/api/faucet/claim",
    { schema: { body: claimBodySchema } },
    async (request, reply) => {
      const instance = faucet();
      if (!instance) {
        return reply.code(404).send({ error: "The faucet is not enabled.", code: "faucet_disabled" });
      }
      try {
        const userId = await requireUser(request);
        budget.checkRequest(userId);
        const result = await instance.claim(sql, request.body.walletAddress, userId);
        request.log.info(
          { wallet: request.body.walletAddress, kind: result.kind, amount: result.amount, signature: result.signature },
          "Faucet claim paid"
        );
        return reply.send(result);
      } catch (error) {
        const { status, body } = errorResponse(error);
        if (status >= 500) request.log.error({ error: body.error }, "Faucet claim failed");
        return reply.code(status).send(body);
      }
    }
  );
}
