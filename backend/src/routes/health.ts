import type { FastifyInstance } from "fastify";
import { dbReadiness, sql } from "../db/pool.js";
import { config } from "../config.js";
import { getCacheSize, getSweepStats } from "../services/boardCache.js";
import { privyJwksUrl } from "../services/privyAuth.js";
import type { MatchRealtimeHub } from "../services/matchRealtime.js";

export interface IndexerHealth {
  indexer?: () => unknown;
  reconciler?: () => unknown;
}

export function healthRoutes(
  app: FastifyInstance,
  realtime?: MatchRealtimeHub,
  indexing: IndexerHealth = {}
): void {
  // Lightweight liveness route for Render. Database readiness remains on
  // /api/health so infrastructure can distinguish a running process from a
  // backend that cannot currently serve indexed game state.
  app.get("/health", async (_req, reply) => {
    reply.code(200).send({ status: "ok" });
  });

  app.get("/api/health", async (_req, reply) => {
    const db = await dbReadiness();
    const dbOk = db.ready;
    const sweepStats = getSweepStats();

    // Row counts make "is anything being stored?" a one-glance answer.
    let stored: Record<string, number> | null = null;
    if (dbOk) {
      const rows = await sql`
        SELECT
          (SELECT COUNT(*) FROM matches)::int AS matches,
          (SELECT COUNT(*) FROM matches WHERE game_status = 'Active')::int AS active,
          (SELECT COUNT(*) FROM matches
            WHERE game_status IN ('WhiteWins', 'BlackWins', 'Draw'))::int AS finished,
          (SELECT COUNT(*) FROM moves)::int AS moves,
          (SELECT COUNT(*) FROM player_stats)::int AS players
      `.catch(() => []);
      stored = (rows[0] as Record<string, number> | undefined) ?? null;
    }

    reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "disconnected",
      ...(db.error ? { dbError: db.error } : {}),
      ...(db.hint ? { dbHint: db.hint } : {}),
      stored,
      indexer: {
        events: indexing.indexer?.() ?? "disabled",
        accounts: indexing.reconciler?.() ?? "disabled",
      },
      cachedBoards: getCacheSize(),
      boardCacheSweep: {
        lastSweepAt: sweepStats.lastSweepAt
          ? new Date(sweepStats.lastSweepAt).toISOString()
          : null,
        lastSweepBefore: sweepStats.lastSweepBefore,
        lastSweepAfter: sweepStats.lastSweepAfter,
      },
      // Public identifiers only, so the frontend's NEXT_PUBLIC_PRIVY_APP_ID
      // and sponsor address can be checked against the backend's.
      auth: {
        privyAppId: config.sponsor.privyAppId || null,
        privyVerification: config.sponsor.privyJwtVerificationKey
          ? "pem-key"
          : config.sponsor.privyAppId
            ? "jwks"
            : "not-configured",
        privyJwksUrl: config.sponsor.privyAppId
          ? config.sponsor.privyJwksUrl || privyJwksUrl(config.sponsor.privyAppId)
          : null,
        sponsorFeePayer: config.sponsor.feePayerAddress || null,
      },
      realtime: realtime?.stats() ?? {
        connections: 0,
        sessions: 0,
        matches: 0,
      },
    });
  });
}
