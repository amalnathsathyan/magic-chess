import { sql } from "../db/pool.js";
import type { MatchRealtimeSnapshot } from "./matchRealtime.js";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function loadMatchRealtimeSnapshot(
  matchId: string
): Promise<MatchRealtimeSnapshot | null> {
  const rows = await sql`
    SELECT
      match_id, white_player, black_player, game_status, game_end_reason,
      betting_token_mint, bet_amount_per_player, total_pot,
      move_timeout_seconds, current_fen, created_at, started_at, ended_at,
      last_move_at, payout_processed,
      (SELECT COUNT(*) FROM moves WHERE moves.match_id = m.match_id) AS move_count
    FROM matches m
    WHERE match_id = ${matchId}
  `;
  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  const currentFen = String(row.currentFen ?? INITIAL_FEN);
  const turn = currentFen.split(" ")[1];
  return {
    matchId: String(row.matchId),
    whitePlayer: String(row.whitePlayer),
    blackPlayer: row.blackPlayer == null ? null : String(row.blackPlayer),
    gameStatus: String(row.gameStatus),
    gameEndReason:
      row.gameEndReason == null ? null : String(row.gameEndReason),
    bettingTokenMint: String(row.bettingTokenMint),
    betAmountPerPlayer: String(row.betAmountPerPlayer ?? "0"),
    totalPot: String(row.totalPot ?? "0"),
    moveTimeoutSeconds: String(row.moveTimeoutSeconds ?? "0"),
    currentFen,
    currentTurn: turn === "w" ? "white" : turn === "b" ? "black" : null,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    lastMoveAt: iso(row.lastMoveAt) ?? new Date(0).toISOString(),
    payoutProcessed: row.payoutProcessed === true,
    moveCount: Number(row.moveCount ?? 0),
  };
}
