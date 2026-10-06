import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";
import { levelFor } from "../services/xp.js";

interface LeaderboardQuery {
  sortBy?: string;
  limit?: number;
}

export function leaderboardRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: LeaderboardQuery }>(
    "/api/leaderboard",
    async (request, reply) => {
      const { sortBy = "wins", limit = 10 } = request.query;

      const effectiveLimit = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 100);

      let orderClause: string;
      switch (sortBy) {
        case "winRate":
          // Filter: minimum 5 games for meaningful win rate
          orderClause =
            "ORDER BY CASE WHEN total_games > 0 THEN wins::float / total_games ELSE 0 END DESC";
          break;
        case "rating":
          orderClause = "ORDER BY rating DESC, wins DESC";
          break;
        case "xp":
          orderClause = "ORDER BY xp DESC, rating DESC";
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
          current_streak, longest_win_streak, rating, peak_rating, rated_games, xp,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = player_pubkey) AS display_name,
          (SELECT avatar FROM player_profiles p WHERE p.wallet = player_pubkey) AS avatar
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
            rating: Number(row.rating) || 0,
            peakRating: Number(row.peakRating) || 0,
            ratedGames: Number(row.ratedGames) || 0,
            xp: Number(row.xp) || 0,
            level: levelFor(Number(row.xp) || 0).level,
            tier: levelFor(Number(row.xp) || 0).tier,
            displayName: (row.displayName as string | null) ?? null,
            avatar: (row.avatar as string | null) ?? null,
          };
        }
      );

      reply.send({ leaderboard, sortBy });
    }
  );
}
