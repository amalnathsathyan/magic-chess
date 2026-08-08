import type { FastifyInstance } from "fastify";
import { checkDbConnection } from "../db/pool.js";
import { getCacheSize } from "../services/boardCache.js";

export function healthRoutes(app: FastifyInstance): void {
  app.get("/api/health", async (_req, reply) => {
    const dbOk = await checkDbConnection();

    reply.send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "disconnected",
      cachedBoards: getCacheSize(),
    });
  });
}
