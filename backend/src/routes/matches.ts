import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";
import { getFen } from "../services/boardCache.js";
import { INITIAL_FEN, sanFromUci } from "../services/movePredictions.js";

const listQuerySchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["WaitingForOpponent", "Active", "WhiteWins", "BlackWins", "Draw", "Aborted", "Completed"],
    },
    player: { type: "string", minLength: 32, maxLength: 44 },
    page: { type: "integer", minimum: 1, maximum: 10_000, default: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
} as const;

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
    { schema: { querystring: listQuerySchema } },
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
          game_end_reason, move_timeout_seconds, current_fen,
          bet_amount_per_player, started_at, ended_at,
          white_rating, black_rating, white_rating_change, black_rating_change,
          white_xp, black_xp,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = matches.white_player) AS white_name,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = matches.black_player) AS black_name,
          GREATEST(COALESCE(ply_count, 0), (SELECT COUNT(*) FROM moves WHERE moves.match_id = matches.match_id)) AS move_count,
          (SELECT COUNT(*) FROM move_bets b
             WHERE b.match_id = matches.match_id AND b.status = 'open') AS open_predictions
        FROM matches
        ${where}
        ORDER BY ${status === "Completed" ? "ended_at DESC NULLS LAST," : ""} last_move_at DESC
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
        moveTimeoutSeconds: String(row.moveTimeoutSeconds),
        createdAt: row.createdAt,
        lastMoveAt: row.lastMoveAt,
        boardFen: row.currentFen ?? getFen(row.matchId as string),
        moveCount: Number(row.moveCount ?? 0),
        betAmountPerPlayer: String(row.betAmountPerPlayer ?? "0"),
        openPredictions: Number(row.openPredictions ?? 0),
        startedAt: row.startedAt ?? null,
        endedAt: row.endedAt ?? null,
        whiteName: row.whiteName ?? null,
        blackName: row.blackName ?? null,
        whiteRating: row.whiteRating ?? null,
        blackRating: row.blackRating ?? null,
        whiteRatingChange: row.whiteRatingChange ?? null,
        blackRatingChange: row.blackRatingChange ?? null,
        whiteXp: row.whiteXp ?? null,
        blackXp: row.blackXp ?? null,
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
          payout_processed, payout_tx_signature, current_fen,
          GREATEST(COALESCE(m.ply_count, 0), (SELECT COUNT(*) FROM moves WHERE moves.match_id = m.match_id)) AS move_count
        FROM matches m
        WHERE match_id = ${matchId}
      `;

      if (rows.length === 0) {
        return reply.code(404).send({ error: "Match not found" });
      }

      const m = rows[0] as Record<string, unknown>;
      const fen = (m.currentFen as string | null) ?? getFen(matchId);
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
        moveTimeoutSeconds: String(m.moveTimeoutSeconds),
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
        SELECT
          match_id, white_player, black_player, game_status, game_end_reason,
          betting_token_mint, bet_amount_per_player, total_pot, move_timeout_seconds,
          created_at, started_at, ended_at, payout_processed, current_fen,
          white_rating, black_rating, white_rating_change, black_rating_change,
          white_xp, black_xp, ply_count,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = m.white_player) AS white_name,
          (SELECT display_name FROM player_profiles p WHERE p.wallet = m.black_player) AS black_name,
          (SELECT avatar FROM player_profiles p WHERE p.wallet = m.white_player) AS white_avatar,
          (SELECT avatar FROM player_profiles p WHERE p.wallet = m.black_player) AS black_avatar
        FROM matches m
        WHERE match_id = ${matchId}
      `;
      if (match.length === 0) {
        return reply.code(404).send({ error: "Match not found" });
      }

      const moves = await sql`
        SELECT
          move_number, player_color, player_pubkey,
          algebraic_move, from_row, from_col, to_row, to_col,
          fen_after_move, is_check, is_checkmate, is_stalemate,
          COALESCE(confirmed_at, indexed_at) AS played_at
        FROM moves
        WHERE match_id = ${matchId}
        ORDER BY move_number ASC
      `;

      // The program logs coordinate moves; derive SAN from the position before
      // each move for a readable move list.
      let fenBefore: string | null = INITIAL_FEN;
      let expectedPly = 1;
      const sans = moves.map((m: Record<string, unknown>) => {
        const san =
          fenBefore && Number(m.moveNumber) === expectedPly
            ? sanFromUci(fenBefore, String(m.algebraicMove))
            : null;
        fenBefore = String(m.fenAfterMove);
        expectedPly = Number(m.moveNumber) + 1;
        return san;
      });

      const meta = match[0] as Record<string, unknown>;
      reply.send({
        matchId,
        whitePlayer: meta.whitePlayer,
        blackPlayer: meta.blackPlayer,
        gameStatus: meta.gameStatus,
        gameEndReason: meta.gameEndReason ?? null,
        bettingTokenMint: meta.bettingTokenMint,
        betAmountPerPlayer: String(meta.betAmountPerPlayer ?? "0"),
        totalPot: String(meta.totalPot ?? "0"),
        moveTimeoutSeconds: String(meta.moveTimeoutSeconds ?? "0"),
        createdAt: meta.createdAt,
        startedAt: meta.startedAt ?? null,
        endedAt: meta.endedAt ?? null,
        payoutProcessed: meta.payoutProcessed,
        finalFen: meta.currentFen ?? null,
        white: {
          name: meta.whiteName ?? null,
          avatar: meta.whiteAvatar ?? null,
          rating: meta.whiteRating ?? null,
          ratingChange: meta.whiteRatingChange ?? null,
          xp: meta.whiteXp ?? null,
        },
        black: {
          name: meta.blackName ?? null,
          avatar: meta.blackAvatar ?? null,
          rating: meta.blackRating ?? null,
          ratingChange: meta.blackRatingChange ?? null,
          xp: meta.blackXp ?? null,
        },
        moves: moves.map((m: Record<string, unknown>, index: number) => ({
          moveNumber: m.moveNumber,
          san: sans[index] ?? m.algebraicMove,
          playerColor: m.playerColor,
          playerPubkey: m.playerPubkey,
          algebraicMove: m.algebraicMove,
          from: `${String.fromCharCode(97 + Number(m.fromCol))}${Number(m.fromRow) + 1}`,
          to: `${String.fromCharCode(97 + Number(m.toCol))}${Number(m.toRow) + 1}`,
          fenAfter: m.fenAfterMove,
          isCheck: m.isCheck,
          isCheckmate: m.isCheckmate,
          isStalemate: m.isStalemate,
          playedAt: m.playedAt ?? null,
        })),
        totalMoves: moves.length,
        // Games rebuilt from the match account can be missing their moves.
        plyCount: Math.max(Number(meta.plyCount ?? 0), moves.length),
        movesComplete: moves.length >= Number(meta.plyCount ?? 0),
      });
    }
  );
}
