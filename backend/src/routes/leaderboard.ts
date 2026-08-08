import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";

interface LeaderboardQuery {
  sortBy?: string;
  limit?: number;
}

export function leaderboardRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: LeaderboardQuery }>(
    "/api/leaderboard",
    async (request, reply) => {
      const { sortBy = "wins", limit = 10 } = request.query;

      const effectiveLimit = Math.min(limit, 100);

      let orderClause: string;
      switch (sortBy) {
        case "winRate":
          // Filter: minimum 5 games for meaningful win rate
          orderClause =
            "ORDER BY CASE WHEN total_games > 0 THEN wins::float / total_games ELSE 0 END DESC";
          break;
        case "totalGames":
          orderClause = "ORDER BY total_games DESC";
          break;
        case "wins":
        default:
          orderClause = "ORDER BY wins DESC, total_games ASC";
          break;
      }

      const rows = await sql.unsafe(
        `SELECT
          player_pubkey, total_games, wins, losses, draws,
          current_streak, longest_win_streak
        FROM player_stats
        WHERE total_games > 0
        ${orderClause}
        LIMIT ${effectiveLimit}`
      );

      const leaderboard = rows.map(
        (row: Record<string, unknown>, index: number) => {
          const total = Number(row.totalGames) || 0;
          const w = Number(row.wins) || 0;
          return {
            rank: index + 1,
            playerPubkey: row.playerPubkey,
            totalGames: total,
            wins: w,
            losses: Number(row.losses) || 0,
            draws: Number(row.draws) || 0,
            winRate: total > 0 ? w / total : 0,
            currentStreak: Number(row.currentStreak) || 0,
            longestWinStreak: Number(row.longestWinStreak) || 0,
          };
        }
      );

      reply.send({ leaderboard, sortBy });
    }
  );
}
