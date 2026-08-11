import type { FastifyInstance } from "fastify";
import { checkDbReadiness } from "../db/pool.js";
import { getCacheSize, getSweepStats } from "../services/boardCache.js";
import type { MatchRealtimeHub } from "../services/matchRealtime.js";

export function healthRoutes(
  app: FastifyInstance,
  realtime?: MatchRealtimeHub
): void {
  app.get("/api/health", async (_req, reply) => {
    const dbOk = await checkDbReadiness();
    const sweepStats = getSweepStats();

    reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "disconnected",
      cachedBoards: getCacheSize(),
      boardCacheSweep: {
        lastSweepAt: sweepStats.lastSweepAt
          ? new Date(sweepStats.lastSweepAt).toISOString()
          : null,
        lastSweepBefore: sweepStats.lastSweepBefore,
        lastSweepAfter: sweepStats.lastSweepAfter,
      },
      realtime: realtime?.stats() ?? {
        connections: 0,
        sessions: 0,
        matches: 0,
      },
    });
  });
}
