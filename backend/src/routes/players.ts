import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";

interface PlayerQuery {
  page?: number;
  limit?: number;
  status?: string;
}

export function playerRoutes(app: FastifyInstance): void {
  // ── Player stats ──
  app.get<{ Params: { pubkey: string } }>(
    "/api/players/:pubkey/stats",
    async (request, reply) => {
      const { pubkey } = request.params;

      const rows = await sql`
        SELECT * FROM player_stats WHERE player_pubkey = ${pubkey}
      `;

      if (rows.length === 0) {
        return reply.send({
          playerPubkey: pubkey,
          totalGames: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          winsByCheckmate: 0,
          winsByResignation: 0,
          winsByTimeout: 0,
          currentStreak: 0,
          longestWinStreak: 0,
          totalWagered: "0",
          totalWon: "0",
          lastGameAt: null,
        });
      }

      const s = rows[0] as Record<string, unknown>;
      const total = Number(s.totalGames) || 0;
      const wins = Number(s.wins) || 0;

      reply.send({
        playerPubkey: s.playerPubkey,
        totalGames: total,
        wins,
        losses: Number(s.losses) || 0,
        draws: Number(s.draws) || 0,
        winRate: total > 0 ? wins / total : 0,
        winsByCheckmate: Number(s.winsByCheckmate) || 0,
        winsByResignation: Number(s.winsByResignation) || 0,
        winsByTimeout: Number(s.winsByTimeout) || 0,
        currentStreak: Number(s.currentStreak) || 0,
        longestWinStreak: Number(s.longestWinStreak) || 0,
        totalWagered: String(s.totalWagered ?? "0"),
        totalWon: String(s.totalWon ?? "0"),
        lastGameAt: s.lastGameAt ?? null,
      });
    }
  );

  // ── Player match history ──
  app.get<{ Params: { pubkey: string }; Querystring: PlayerQuery }>(
    "/api/players/:pubkey/matches",
    async (request, reply) => {
      const { pubkey } = request.params;
      const { page = 1, limit = 20, status } = request.query;

      const offset = (page - 1) * Math.min(limit, 100);
      const effectiveLimit = Math.min(limit, 100);

      // Parameterized query — same pattern as matches.ts
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      conditions.push(
        `(white_player = $${params.length + 1} OR black_player = $${params.length + 1})`
      );
      params.push(pubkey);

      if (status) {
        if (status === "Completed") {
          conditions.push(
            `game_status IN ('WhiteWins', 'BlackWins', 'Draw')`
          );
        } else {
          conditions.push(`game_status = $${params.length + 1}`);
          params.push(status);
        }
      }
      const where = `WHERE ${conditions.join(" AND ")}`;

      const countResult = await sql.unsafe(
        `SELECT COUNT(*) as total FROM matches ${where}`,
        params
      );
      const total = Number(countResult[0]?.total ?? 0);

      const rows = await sql.unsafe(
        `SELECT
          match_id, white_player, black_player, game_status,
          game_end_reason, total_pot, betting_token_mint,
          created_at, ended_at,
          (SELECT COUNT(*) FROM moves WHERE moves.match_id = matches.match_id) AS move_count
        FROM matches
        ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, effectiveLimit, offset]
      );

      reply.send({
        matches: rows.map((m: Record<string, unknown>) => ({
          matchId: m.matchId,
          whitePlayer: m.whitePlayer,
          blackPlayer: m.blackPlayer,
          gameStatus: m.gameStatus,
          gameEndReason: m.gameEndReason,
          totalPot: String(m.totalPot ?? "0"),
          bettingTokenMint: m.bettingTokenMint,
          createdAt: m.createdAt,
          endedAt: m.endedAt,
          moveCount: Number(m.moveCount ?? 0),
          playerColor:
            m.whitePlayer === pubkey ? "white" : "black",
        })),
        pagination: { page, limit: effectiveLimit, total },
      });
    }
  );
}
