import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { healthRoutes } from "./routes/health.js";
import { matchRoutes } from "./routes/matches.js";
import { playerRoutes } from "./routes/players.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { syncRoutes } from "./routes/sync.js";

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
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });

  // Run DB migrations
  try {
    console.log("Running database migrations...");
    await runMigrations();
    console.log("Migrations complete.");
  } catch (err) {
    app.log.error(err, "Migration failed");
    process.exit(1);
  }

  // Routes
  healthRoutes(app);
  matchRoutes(app);
  playerRoutes(app);
  leaderboardRoutes(app);
  syncRoutes(app);

  // Start
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(
      `Backend running at http://localhost:${config.port}`
    );
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

main();
