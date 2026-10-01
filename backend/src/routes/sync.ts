import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifyProgramEvent } from "../services/transactionVerifier.js";
import type { MatchRealtimeHub } from "../services/matchRealtime.js";
import { ingestEvent, type IngestHooks } from "../services/eventIngest.js";
import { syncAuthMode } from "../services/syncAuth.js";

// ── Auth helper ──
function authorizeSyncRequest(request: {
  headers: Record<string, string | string[] | undefined>;
}): void {
  const raw = request.headers["x-api-key"];
  if (syncAuthMode(raw, config.apiKey) === "invalid") {
    throw { statusCode: 401, message: "Unauthorized — invalid X-API-Key" };
  }
}

// ── Rate limiter (per-IP, sliding window) ──
const syncRateLimits = new Map<string, { windowStart: number; count: number }>();
const MAX_SYNC_RATE_LIMIT_ENTRIES = 4096;

function enforceSyncRateLimit(ip: string): void {
  const now = Date.now();
  const current = syncRateLimits.get(ip);
  if (!current || now - current.windowStart >= 60_000) {
    syncRateLimits.set(ip, { windowStart: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 60) {
    throw { statusCode: 429, message: "Sync rate limit exceeded" };
  }
}

// Periodic cleanup of expired rate limit entries
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of syncRateLimits) {
    if (entry.windowStart < cutoff) syncRateLimits.delete(key);
  }
  // Hard cap: if still too large, clear all
  if (syncRateLimits.size > MAX_SYNC_RATE_LIMIT_ENTRIES) {
    syncRateLimits.clear();
  }
}, 60_000).unref();

interface SyncRequest {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
  eventIndex?: number;
}

const syncBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["matchId", "signature"],
  properties: {
    matchId: { type: "string", minLength: 1, maxLength: 32 },
    signature: {
      type: "string",
      minLength: 64,
      maxLength: 88,
      pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
    },
    runtimeEndpoint: { type: "string", maxLength: 255 },
    eventIndex: { type: "integer", minimum: 0 },
  },
} as const;

function assertMatchId(matchId: string): void {
  if (Buffer.byteLength(matchId, "utf8") > 32) {
    throw { statusCode: 400, message: "matchId must be at most 32 UTF-8 bytes" };
  }
}

const ROUTES = [
  { path: "/api/sync/match-created", events: ["MatchCreatedEvent"] },
  { path: "/api/sync/player-joined", events: ["PlayerJoinedEvent"] },
  { path: "/api/sync/match-aborted", events: ["MatchAbortedEvent"] },
  { path: "/api/sync/move-made", events: ["MoveMadeEvent"] },
  { path: "/api/sync/game-ended", events: ["GameEndedEvent"] },
  { path: "/api/sync/payout", events: ["PayoutEvent", "DrawPayoutEvent"] },
] as const;

/**
 * Browser-submitted indexing hints. The backend never trusts the body beyond
 * the signature: it re-reads the confirmed transaction from the configured
 * runtime and only applies Magic Chess events found in its logs. The chain
 * indexer reaches the same state on its own; these hints just make it faster.
 */
export function syncRoutes(
  app: FastifyInstance,
  realtime?: MatchRealtimeHub,
  hooks: IngestHooks = {}
): void {
  for (const route of ROUTES) {
    app.post<{ Body: SyncRequest }>(
      route.path,
      { schema: { body: syncBodySchema } },
      async (request, reply) => {
        authorizeSyncRequest(request);
        enforceSyncRateLimit(request.ip);
        const { matchId, signature, runtimeEndpoint, eventIndex } = request.body;
        assertMatchId(matchId);
        const verified = await verifyProgramEvent({
          signature,
          matchId,
          runtimeEndpoint,
          eventIndex,
          eventNames: [...route.events],
        });

        const result = await ingestEvent(
          {
            event: verified.event,
            signature,
            slot: verified.slot,
            eventIndex: verified.eventIndex,
            blockTime: verified.blockTime,
          },
          hooks
        );

        if (result.status === "deferred") {
          return reply.code(409).send({ error: result.reason });
        }
        if (result.status === "applied" && realtime) {
          try {
            await realtime.refresh(matchId, result.notification);
          } catch (error) {
            // Indexing already committed. Realtime polling reconciles shortly.
            app.log.error({ error, matchId }, "Realtime notification failed");
          }
        }
        return reply.send({
          ok: true,
          duplicate: result.status === "duplicate" || undefined,
          fen: result.fen,
          moveNumber: result.moveNumber,
        });
      }
    );
  }
}
