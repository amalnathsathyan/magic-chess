import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { healthRoutes } from "./routes/health.js";
import { matchRoutes } from "./routes/matches.js";
import { playerRoutes } from "./routes/players.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { syncRoutes } from "./routes/sync.js";
import { sql } from "./db/pool.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { MatchRealtimeHub } from "./services/matchRealtime.js";
import { loadMatchRealtimeSnapshot } from "./services/matchSnapshot.js";
import { transactionRoutes } from "./routes/transactions.js";

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });

  if (config.runMigrationsOnStart) {
    try {
      app.log.info("Running database migrations");
      await runMigrations();
      app.log.info("Migrations complete");
    } catch (err) {
      app.log.error(err, "Migration failed");
      process.exit(1);
    }
  }

  const realtime = new MatchRealtimeHub(loadMatchRealtimeSnapshot, {
    onRefreshError: (error, matchId) =>
      app.log.error({ error, matchId }, "Realtime snapshot refresh failed"),
  });
  realtime.start();

  // Routes
  healthRoutes(app, realtime);
  matchRoutes(app);
  realtimeRoutes(app, realtime);
  playerRoutes(app);
  leaderboardRoutes(app);
  syncRoutes(app, realtime);
  transactionRoutes(app);

  app.addHook("onClose", async () => realtime.close());

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await sql.end({ timeout: 5 });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  // Start
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info({ port: config.port }, "Backend listening");
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

main();
