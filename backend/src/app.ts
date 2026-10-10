import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { corsOptions } from "./cors.js";
import { runMigrations } from "./db/migrate.js";
import { healthRoutes } from "./routes/health.js";
import { matchRoutes } from "./routes/matches.js";
import { playerRoutes } from "./routes/players.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { syncRoutes } from "./routes/sync.js";
import { checkDbReadiness, sql } from "./db/pool.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { MatchRealtimeHub } from "./services/matchRealtime.js";
import { loadMatchRealtimeSnapshot } from "./services/matchSnapshot.js";
import { transactionRoutes } from "./routes/transactions.js";
import { predictionRoutes } from "./routes/predictions.js";
import { ingestEvent, type IngestHooks } from "./services/eventIngest.js";
import { ChainIndexer } from "./services/chainIndexer.js";
import { MatchReconciler } from "./services/matchReconciler.js";
import { MovePredictionService } from "./services/movePredictions.js";
import { PredictionSessions } from "./services/predictionSession.js";
import { readLiveMatchState } from "./services/matchState.js";

async function waitForDb(): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    if (await checkDbReadiness()) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 5_000 * 2 ** attempt)));
  }
}

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
  await app.register(cors, corsOptions(config.corsOrigins));

  // A database outage must not take down the gas-sponsor relay, which needs
  // no database: keep serving and retry migrations in the background.
  // /api/health reports "degraded" until they succeed.
  if (config.runMigrationsOnStart) {
    const migrate = async (attempt: number): Promise<void> => {
      try {
        app.log.info({ attempt }, "Running database migrations");
        await runMigrations();
        app.log.info("Migrations complete");
      } catch (err) {
        const delayMs = Math.min(5 * 60_000, 15_000 * 2 ** Math.min(attempt, 4));
        app.log.error({ err, retryInMs: delayMs }, "Migration failed; serving degraded and retrying");
        setTimeout(() => void migrate(attempt + 1), delayMs).unref();
      }
    };
    await migrate(0);
  }

  const realtime = new MatchRealtimeHub(loadMatchRealtimeSnapshot, {
    onRefreshError: (error, matchId) =>
      app.log.error({ error, matchId }, "Realtime snapshot refresh failed"),
  });
  realtime.start();

  const predictions = new MovePredictionService({
    readLiveState: readLiveMatchState,
    publish: (matchId, event, data) => realtime.publish(matchId, event, data),
  });
  const hooks: IngestHooks = {
    onMoveIndexed: ({ matchId }) => predictions.onMoveIndexed({ matchId }),
    onGameEnded: (args) => predictions.onGameEnded(args),
  };

  matchRoutes(app);
  realtimeRoutes(app, realtime);
  playerRoutes(app);
  leaderboardRoutes(app);
  syncRoutes(app, realtime, hooks);
  transactionRoutes(app);
  predictionRoutes(app, predictions, new PredictionSessions(config.predictions.sessionSecret));

  const indexer = new ChainIndexer({
    ingest: (input) => ingestEvent(input, hooks),
    onApplied: async (matchId, result) => {
      await realtime.refresh(matchId, result.notification).catch((error) =>
        app.log.warn({ error: String(error), matchId }, "Realtime refresh after index failed")
      );
    },
    log: app.log,
    matchIntervalMs: config.indexer.matchIntervalMs,
    programIntervalMs: config.indexer.programIntervalMs,
  });
  // Rebuilds rows from on-chain match accounts, so games played while the
  // server slept or the database was down still reach the index.
  const reconciler = new MatchReconciler({
    intervalMs: config.indexer.reconcileIntervalMs,
    log: app.log,
    onChanged: async (matchId) => {
      await realtime.refresh(matchId).catch(() => undefined);
    },
    onMissingMoves: (matchId) => indexer.scanMatchNow(matchId),
  });
  if (config.indexer.enabled) {
    indexer.start();
    // Wait for the schema before the first sweep writes to it.
    void waitForDb().then(() => reconciler.start());
  }

  // Routes
  healthRoutes(app, realtime, {
    indexer: config.indexer.enabled ? () => indexer.stats() : undefined,
    reconciler: config.indexer.enabled ? () => reconciler.stats() : undefined,
  });

  // Safety net for settlements a missed hook left open.
  const sweep = setInterval(() => {
    predictions.sweep().catch((error) =>
      app.log.warn({ error: String(error) }, "Prediction sweep failed")
    );
  }, 30_000);
  sweep.unref();

  app.addHook("onClose", async () => {
    clearInterval(sweep);
    indexer.close();
    reconciler.close();
    realtime.close();
  });

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
