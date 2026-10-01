import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { config } from "../config.js";
import { verifyPrivyAccessToken } from "../services/privyAuth.js";
import {
  SolanaSponsorService,
  SponsorError,
} from "../services/solanaSponsor.js";
import { SponsorBudget, SponsorBudgetError } from "../services/sponsorBudget.js";

interface SponsorTransactionBody {
  transaction: string;
  walletAddress: string;
  lastValidBlockHeight: number;
}

const sponsorBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["transaction", "walletAddress", "lastValidBlockHeight"],
  properties: {
    transaction: { type: "string", minLength: 1, maxLength: 2_000 },
    walletAddress: {
      type: "string",
      minLength: 32,
      maxLength: 44,
      pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
    },
    lastValidBlockHeight: { type: "integer", minimum: 1 },
  },
} as const;

const budget = new SponsorBudget({
  requestsPerMinute: config.sponsor.requestsPerMinute,
  costlyPerHour: config.sponsor.costlyPerHour,
  hourlyBudgetLamports: config.sponsor.hourlyBudgetLamports,
});
setInterval(() => budget.sweep(), 60_000).unref();

function withBudget<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof SponsorBudgetError) {
      throw new SponsorError(error.message, 429, "rate_limited");
    }
    throw error;
  }
}

let sponsorService: SolanaSponsorService | null = null;

function bearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new SponsorError("Privy access token is required", 401, "unauthorized");
  }
  return authorization.slice("Bearer ".length);
}

async function verifyRequestToken(token: string) {
  if (!config.sponsor.privyAppId || !config.sponsor.privyJwtVerificationKey) {
    throw new SponsorError(
      "Privy access-token verification is not configured",
      503,
      "sponsor_unavailable"
    );
  }
  try {
    return await verifyPrivyAccessToken(
      token,
      config.sponsor.privyAppId,
      config.sponsor.privyJwtVerificationKey
    );
  } catch {
    throw new SponsorError(
      "Privy access token is invalid or expired",
      401,
      "unauthorized"
    );
  }
}

function buildSponsor(): SolanaSponsorService {
  if (sponsorService) return sponsorService;
  sponsorService = new SolanaSponsorService(
    config.solana.rpcEndpoint,
    {
      programId: new PublicKey(config.solana.programId),
      wagerMint: new PublicKey(config.solana.wagerMint),
      platformFeeWallet: config.solana.platformFeeWallet
        ? new PublicKey(config.solana.platformFeeWallet)
        : undefined,
      maxWagerLamports: config.sponsor.maxWagerLamports,
    },
    config.sponsor.feePayerPrivateKey,
    config.sponsor.feePayerAddress
  );
  return sponsorService;
}

export function transactionRoutes(app: FastifyInstance): void {
  app.post<{ Body: SponsorTransactionBody }>(
    "/api/transactions/sponsor",
    { schema: { body: sponsorBodySchema } },
    async (request, reply) => {
      try {
        const claims = await verifyRequestToken(
          bearerToken(request.headers.authorization)
        );
        withBudget(() => budget.checkRequest(claims.userId));
        const player = new PublicKey(request.body.walletAddress);
        const sponsor = buildSponsor();
        const input = {
          serialized: Buffer.from(request.body.transaction, "base64"),
          player,
          lastValidBlockHeight: request.body.lastValidBlockHeight,
        };
        const analyzed = sponsor.analyze(input);
        withBudget(() =>
          budget.reserve(claims.userId, analyzed.estimatedCostLamports, analyzed.costly)
        );
        const signature = await sponsor.relay(input, analyzed);
        return reply.code(200).send({ signature });
      } catch (error) {
        const sponsorError =
          error instanceof SponsorError
            ? error
            : new SponsorError(
                error instanceof Error ? error.message : "Sponsorship failed",
                500,
                "sponsor_error"
              );
        request.log.warn(
          { code: sponsorError.code, error: sponsorError.message },
          "Sponsored Solana transaction rejected"
        );
        return reply.code(sponsorError.statusCode).send({
          error: sponsorError.message,
          code: sponsorError.code,
        });
      }
    }
  );
}
