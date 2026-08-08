import type { FastifyInstance } from "fastify";
import { checkDbReadiness } from "../db/pool.js";
import { getCacheSize } from "../services/boardCache.js";
import type { MatchRealtimeHub } from "../services/matchRealtime.js";

export function healthRoutes(
  app: FastifyInstance,
  realtime?: MatchRealtimeHub
): void {
  app.get("/api/health", async (_req, reply) => {
    const dbOk = await checkDbReadiness();

    reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "disconnected",
      cachedBoards: getCacheSize(),
      realtime: realtime?.stats() ?? {
        connections: 0,
        sessions: 0,
        matches: 0,
      },
    });
  });
}
