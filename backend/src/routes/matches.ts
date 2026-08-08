import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";
import { getFen } from "../services/boardCache.js";

interface MatchQuery {
  status?: string;
  player?: string;
  page?: number;
  limit?: number;
}

export function matchRoutes(app: FastifyInstance): void {
  // ── List matches ──
  app.get<{ Querystring: MatchQuery }>(
    "/api/matches",
    async (request, reply) => {
      const { status, player, page = 1, limit = 20 } = request.query;

      const offset = (page - 1) * Math.min(limit, 100);
      const effectiveLimit = Math.min(limit, 100);

      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (status) {
        // "Completed" maps to terminal states in DB
        if (status === "Completed") {
          conditions.push(
            `game_status IN ('WhiteWins', 'BlackWins', 'Draw')`
          );
        } else {
          conditions.push(`game_status = $${params.length + 1}`);
          params.push(status);
        }
      }

      if (player) {
        conditions.push(
          `(white_player = $${params.length + 1} OR black_player = $${
            params.length + 1
          })`
        );
        params.push(player);
      }

      const where =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const countResult = await sql.unsafe(
        `SELECT COUNT(*) as total FROM matches ${where}`,
        params
      );
      const total = Number(countResult[0]?.total ?? 0);

      const rows = await sql.unsafe(
        `SELECT
          match_id, white_player, black_player, game_status,
          total_pot, betting_token_mint, created_at, last_move_at,
          game_end_reason, move_timeout_seconds,
          (SELECT COUNT(*) FROM moves WHERE moves.match_id = matches.match_id) AS move_count
        FROM matches
        ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, effectiveLimit, offset]
      );

      const matches = rows.map((row: Record<string, unknown>) => ({
        matchId: row.matchId,
        whitePlayer: row.whitePlayer,
        blackPlayer: row.blackPlayer,
        gameStatus: row.gameStatus,
        gameEndReason: row.gameEndReason,
        totalPot: String(row.totalPot ?? "0"),
        bettingTokenMint: row.bettingTokenMint,
        moveTimeoutSeconds: row.moveTimeoutSeconds,
        createdAt: row.createdAt,
        lastMoveAt: row.lastMoveAt,
        boardFen: getFen(row.matchId as string),
        moveCount: Number(row.moveCount ?? 0),
      }));

      reply.send({
        matches,
        pagination: { page, limit: effectiveLimit, total },
      });
    }
  );

  // ── Single match ──
  app.get<{ Params: { matchId: string } }>(
    "/api/matches/:matchId",
    async (request, reply) => {
      const { matchId } = request.params;

      const rows = await sql`
        SELECT
          match_id, white_player, black_player, game_status,
          game_end_reason, betting_token_mint, bet_amount_per_player,
          total_pot, platform_fee_bps, move_timeout_seconds,
          created_at, started_at, ended_at, last_move_at,
          payout_processed, payout_tx_signature,
          (SELECT COUNT(*) FROM moves WHERE moves.match_id = m.match_id) AS move_count
        FROM matches m
        WHERE match_id = ${matchId}
      `;

      if (rows.length === 0) {
        return reply.code(404).send({ error: "Match not found" });
      }

      const m = rows[0] as Record<string, unknown>;
      const fen = getFen(matchId);
      const turn = fen ? fen.split(" ")[1] : null;

      reply.send({
        matchId: m.matchId,
        whitePlayer: m.whitePlayer,
        blackPlayer: m.blackPlayer,
        gameStatus: m.gameStatus,
        gameEndReason: m.gameEndReason,
        bettingTokenMint: m.bettingTokenMint,
        betAmountPerPlayer: String(m.betAmountPerPlayer ?? "0"),
        totalPot: String(m.totalPot ?? "0"),
        platformFeeBps: m.platformFeeBps,
        moveTimeoutSeconds: m.moveTimeoutSeconds,
        currentTurn:
          turn === "w" ? "white" : turn === "b" ? "black" : null,
        boardFen: fen,
        createdAt: m.createdAt,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        lastMoveAt: m.lastMoveAt,
        payoutProcessed: m.payoutProcessed,
        moveCount: Number(m.moveCount ?? 0),
      });
    }
  );

  // ── Move history ──
  app.get<{ Params: { matchId: string } }>(
    "/api/matches/:matchId/history",
    async (request, reply) => {
      const { matchId } = request.params;

      // Verify match exists
      const match = await sql`
        SELECT match_id, white_player, black_player FROM matches
        WHERE match_id = ${matchId}
      `;
      if (match.length === 0) {
        return reply.code(404).send({ error: "Match not found" });
      }

      const moves = await sql`
        SELECT
          move_number, player_color, player_pubkey,
          algebraic_move, from_row, from_col, to_row, to_col,
          fen_after_move, is_check, is_checkmate, is_stalemate
        FROM moves
        WHERE match_id = ${matchId}
        ORDER BY move_number ASC
      `;

      reply.send({
        matchId,
        whitePlayer: match[0].whitePlayer,
        blackPlayer: match[0].blackPlayer,
        moves: moves.map((m: Record<string, unknown>) => ({
          moveNumber: m.moveNumber,
          playerColor: m.playerColor,
          playerPubkey: m.playerPubkey,
          algebraicMove: m.algebraicMove,
          from: `${String.fromCharCode(97 + Number(m.fromCol))}${Number(m.fromRow) + 1}`,
          to: `${String.fromCharCode(97 + Number(m.toCol))}${Number(m.toRow) + 1}`,
          fenAfter: m.fenAfterMove,
          isCheck: m.isCheck,
          isCheckmate: m.isCheckmate,
          isStalemate: m.isStalemate,
        })),
        totalMoves: moves.length,
      });
    }
  );
}
