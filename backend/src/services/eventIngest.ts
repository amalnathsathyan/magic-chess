import type { Sql } from "postgres";
import { sql } from "../db/pool.js";
import { initMatch, removeMatch } from "./boardCache.js";
import type { VerifiedProgramEvent } from "./transactionVerifier.js";
import type { MatchNotification } from "./matchRealtime.js";
import { awardGameXp } from "./xpLedger.js";
import {
  INITIAL_RATING,
  rateGame,
  whiteScoreFor,
  type RatedPlayer,
} from "./rating.js";

/**
 * Applies verified Magic Chess program events to Postgres.
 *
 * Shared by the browser-submitted `/api/sync/*` hints and the backend chain
 * indexer, so both paths are idempotent (via `sync_events`) and produce the
 * same rows. Moves are numbered by ply derived from the on-chain FEN, not by
 * arrival order, so a missed or out-of-order event never shifts later moves.
 */

export interface IngestInput {
  event: VerifiedProgramEvent;
  signature: string;
  slot: number;
  eventIndex: number;
  blockTime: number | null;
}

export type IngestResult =
  | { status: "applied"; notification: MatchNotification; moveNumber?: number; fen?: string }
  | { status: "duplicate"; moveNumber?: number; fen?: string }
  /** A prerequisite (e.g. the match row) is not indexed yet; retry later. */
  | { status: "deferred"; reason: string };

export interface IngestHooks {
  onMoveIndexed?: (args: {
    matchId: string;
    ply: number;
    uci: string;
    fenAfter: string;
    confirmedAtMs: number | null;
  }) => Promise<void>;
  onGameEnded?: (args: { matchId: string; finalPly: number }) => Promise<void>;
}

const gameStatusToDb: Record<string, string> = {
  whiteWins: "WhiteWins",
  blackWins: "BlackWins",
  draw: "Draw",
};

const gameEndReasonToDb: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  resignation: "Resignation",
  timeout: "Timeout",
  fiftyMoveRule: "FiftyMoveRule",
  threefoldRepetition: "ThreefoldRepetition",
  insufficientMaterial: "InsufficientMaterial",
};

const EVENT_TYPE: Record<VerifiedProgramEvent["name"], string> = {
  MatchCreatedEvent: "match-created",
  PlayerJoinedEvent: "player-joined",
  MatchAbortedEvent: "match-aborted",
  MoveMadeEvent: "move-made",
  GameEndedEvent: "game-ended",
  PayoutEvent: "payout",
  DrawPayoutEvent: "payout",
};

/**
 * Number of half-moves played once the position in `fen` is reached.
 * After White's first move the FEN reads "... b ... 1" → ply 1.
 */
export function plyFromFen(fen: string): number {
  const fields = fen.trim().split(/\s+/);
  const active = fields[1];
  const fullmove = Number(fields[5]);
  if ((active !== "w" && active !== "b") || !Number.isInteger(fullmove) || fullmove < 1) {
    throw new Error(`Cannot derive ply from FEN: ${fen}`);
  }
  return (fullmove - 1) * 2 + (active === "b" ? 1 : 0);
}

class Deferred extends Error {}

function confirmedAt(blockTime: number | null): Date {
  return blockTime === null ? new Date() : new Date(blockTime * 1000);
}

async function claimEvent(tx: Sql, input: IngestInput, matchId: string): Promise<boolean> {
  const rows = await tx`
    INSERT INTO sync_events (
      event_signature, event_type, match_id, event_slot, event_index
    ) VALUES (
      ${input.signature}, ${EVENT_TYPE[input.event.name]}, ${matchId},
      ${input.slot}, ${input.eventIndex}
    )
    ON CONFLICT (event_signature, event_type, match_id, event_index) DO NOTHING
    RETURNING event_signature
  `;
  return rows.length === 1;
}

export async function ingestEvent(
  input: IngestInput,
  hooks: IngestHooks = {}
): Promise<IngestResult> {
  const { event } = input;
  let result: IngestResult;
  try {
    result = await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      if (!(await claimEvent(tx, input, event.matchId))) {
        if (event.name === "MoveMadeEvent") {
          const ply = plyFromFen(event.boardFen);
          return { status: "duplicate", moveNumber: ply, fen: event.boardFen } as const;
        }
        return { status: "duplicate" } as const;
      }
      return applyEvent(tx, input);
    });
  } catch (error) {
    if (error instanceof Deferred) return { status: "deferred", reason: error.message };
    throw error;
  }

  if (result.status !== "applied") return result;

  // Post-commit side effects. Failures here never undo indexing.
  if (event.name === "MatchCreatedEvent") initMatch(event.matchId);
  if (
    event.name === "GameEndedEvent" ||
    event.name === "MatchAbortedEvent"
  ) {
    removeMatch(event.matchId);
  }
  try {
    await runHooks(input, result, hooks);
  } catch (error) {
    // Prediction settlement has its own sweep; never fail indexing over it.
    console.error("Ingest hook failed", error);
  }
  return result;
}

async function runHooks(
  input: IngestInput,
  result: Extract<IngestResult, { status: "applied" }>,
  hooks: IngestHooks
): Promise<void> {
  const { event } = input;
  if (event.name === "MoveMadeEvent" && hooks.onMoveIndexed && result.moveNumber) {
    await hooks.onMoveIndexed({
      matchId: event.matchId,
      ply: result.moveNumber,
      uci: event.algebraicMove,
      fenAfter: event.boardFen,
      confirmedAtMs: input.blockTime === null ? null : input.blockTime * 1000,
    });
  }
  if (
    (event.name === "GameEndedEvent" || event.name === "MatchAbortedEvent") &&
    hooks.onGameEnded
  ) {
    const rows = await sql`
      SELECT COALESCE(MAX(move_number), 0) AS ply FROM moves
      WHERE match_id = ${event.matchId}
    `;
    await hooks.onGameEnded({
      matchId: event.matchId,
      finalPly: Number(rows[0]?.ply ?? 0),
    });
  }
}

async function applyEvent(tx: Sql, input: IngestInput): Promise<IngestResult> {
  const { event, signature, slot } = input;
  switch (event.name) {
    case "MatchCreatedEvent": {
      await tx`
        INSERT INTO matches (
          match_id, white_player, betting_token_mint,
          bet_amount_per_player, total_pot, platform_fee_bps,
          move_timeout_seconds, created_at, last_move_at,
          last_webhook_slot, last_webhook_sig
        ) VALUES (
          ${event.matchId}, ${event.creator}, ${event.bettingTokenMint},
          ${event.betAmount}, ${event.betAmount}, ${event.platformFeeBasisPoints},
          ${event.moveTimeoutDuration}, ${confirmedAt(input.blockTime)},
          ${confirmedAt(input.blockTime)}, ${slot}, ${signature}
        )
        ON CONFLICT (match_id) DO NOTHING
      `;
      return {
        status: "applied",
        notification: { type: "match-created", creator: event.creator, signature },
      };
    }

    case "PlayerJoinedEvent": {
      const joinedAt = confirmedAt(input.blockTime);
      const rows = await tx`
        UPDATE matches
        SET black_player = ${event.playerTwo},
            total_pot = bet_amount_per_player * 2,
            game_status = 'Active',
            started_at = ${joinedAt},
            last_move_at = ${joinedAt},
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${event.matchId}
          AND game_status = 'WaitingForOpponent'
          AND black_player IS NULL
          AND white_player = ${event.playerOne}
        RETURNING match_id
      `;
      if (rows.length === 0) {
        if (await alreadyIn(tx, event.matchId, "black_player = $2", [event.playerTwo])) {
          return { status: "duplicate" };
        }
        throw new Deferred("Match is not indexed or already joined");
      }
      return {
        status: "applied",
        notification: {
          type: "player-joined",
          whitePlayer: event.playerOne,
          blackPlayer: event.playerTwo,
          signature,
        },
      };
    }

    case "MatchAbortedEvent": {
      const rows = await tx`
        UPDATE matches
        SET game_status = 'Aborted',
            game_end_reason = 'Aborted',
            payout_processed = TRUE,
            ended_at = ${confirmedAt(input.blockTime)},
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${event.matchId}
          AND game_status = 'WaitingForOpponent'
          AND white_player = ${event.creator}
        RETURNING match_id
      `;
      if (rows.length === 0) {
        if (await alreadyIn(tx, event.matchId, "game_status = 'Aborted'", [])) {
          return { status: "duplicate" };
        }
        throw new Deferred("Match is not indexed or cannot be aborted");
      }
      return {
        status: "applied",
        notification: { type: "match-aborted", creator: event.creator, signature },
      };
    }

    case "MoveMadeEvent": {
      const ply = plyFromFen(event.boardFen);
      const matchRows = await tx`
        SELECT match_id FROM matches WHERE match_id = ${event.matchId} FOR UPDATE
      `;
      if (matchRows.length === 0) throw new Deferred("Match must be indexed before its moves");

      const dbColor = event.playerColor === "white" ? "White" : "Black";
      const inserted = await tx`
        INSERT INTO moves (
          match_id, move_number, player_pubkey, player_color,
          from_row, from_col, to_row, to_col,
          algebraic_move, promotion_piece, fen_after_move,
          is_check, is_checkmate, is_stalemate,
          event_slot, event_signature, event_index, indexed_at, confirmed_at
        ) VALUES (
          ${event.matchId}, ${ply}, ${event.player}, ${dbColor},
          ${event.fromRow}, ${event.fromCol}, ${event.toRow}, ${event.toCol},
          ${event.algebraicMove}, ${event.promotionPiece}, ${event.boardFen},
          ${event.isCheck}, ${event.isCheckmate}, ${event.isStalemate},
          ${slot}, ${signature}, ${input.eventIndex}, NOW(),
          ${input.blockTime === null ? null : confirmedAt(input.blockTime)}
        )
        ON CONFLICT (match_id, move_number) DO NOTHING
        RETURNING move_number
      `;
      if (inserted.length === 0) {
        return { status: "duplicate", moveNumber: ply, fen: event.boardFen };
      }

      // Only the newest ply moves the match head; late backfills don't.
      await tx`
        UPDATE matches
        SET current_fen = ${event.boardFen},
            last_move_slot = ${slot},
            last_move_signature = ${signature},
            last_move_event_index = ${input.eventIndex},
            last_move_at = ${confirmedAt(input.blockTime)},
            ply_count = GREATEST(COALESCE(ply_count, 0), ${ply}),
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${event.matchId}
          AND ${ply} >= (SELECT COALESCE(MAX(move_number), 0) FROM moves WHERE match_id = ${event.matchId})
      `;
      return {
        status: "applied",
        moveNumber: ply,
        fen: event.boardFen,
        notification: {
          type: "move-made",
          moveNumber: ply,
          algebraicMove: event.algebraicMove,
          player: event.player,
          playerColor: event.playerColor,
          signature,
        },
      };
    }

    case "GameEndedEvent": {
      const dbStatus = gameStatusToDb[event.status];
      const dbReason = gameEndReasonToDb[event.reason];
      if (!dbStatus || !dbReason) throw new Deferred("Unsupported terminal event values");
      const rows = await tx`
        UPDATE matches
        SET game_status = ${dbStatus},
            game_end_reason = ${dbReason},
            ended_at = ${confirmedAt(input.blockTime)},
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${event.matchId}
          AND game_status = 'Active'
        RETURNING match_id
      `;
      if (rows.length === 0) {
        // The reconciler may have recorded the result from the match account.
        if (await alreadyIn(tx, event.matchId, "game_status = $2", [dbStatus])) {
          return { status: "duplicate" };
        }
        throw new Deferred("Match is not active in the index yet");
      }
      await updatePlayerStats(tx, event.matchId, event.status, event.reason);
      return {
        status: "applied",
        notification: {
          type: "game-ended",
          status: dbStatus,
          reason: dbReason,
          winner: event.winner,
          signature,
        },
      };
    }

    case "PayoutEvent":
    case "DrawPayoutEvent": {
      const rows = await tx`
        UPDATE matches
        SET payout_processed = TRUE,
            payout_tx_signature = ${signature},
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${event.matchId}
          AND payout_processed = FALSE
          AND game_status IN ('WhiteWins', 'BlackWins', 'Draw')
        RETURNING match_id
      `;
      if (rows.length === 0) {
        if (await alreadyIn(tx, event.matchId, "payout_processed = TRUE", [])) {
          return { status: "duplicate" };
        }
        throw new Deferred("Match result is not indexed yet");
      }
      return {
        status: "applied",
        notification: { type: "payout-processed", signature },
      };
    }
  }
}

/** True when the match row already reflects what an event would record. */
async function alreadyIn(
  tx: Sql,
  matchId: string,
  condition: string,
  params: string[]
): Promise<boolean> {
  const rows = await tx.unsafe(
    `SELECT 1 FROM matches WHERE match_id = $1 AND ${condition}`,
    [matchId, ...params]
  );
  return rows.length > 0;
}

export async function updatePlayerStats(
  s: Sql,
  matchId: string,
  status: string,
  reason: string
): Promise<void> {
  const match = await s`
    SELECT white_player, black_player, bet_amount_per_player, total_pot
    FROM matches WHERE match_id = ${matchId}
  `;
  if (match.length === 0) return;

  const { whitePlayer, blackPlayer, betAmountPerPlayer, totalPot } =
    match[0] as Record<string, string>;
  const bet = String(betAmountPerPlayer ?? "0");
  const pot = String(totalPot ?? "0");
  const whiteScore = whiteScoreFor(status);
  if (!blackPlayer || whiteScore === null) return;

  // Lock both rows (in a fixed order) so concurrent results rate sequentially.
  const current = await s`
    SELECT player_pubkey, rating, rated_games FROM player_stats
    WHERE player_pubkey IN (${whitePlayer}, ${blackPlayer})
    ORDER BY player_pubkey
    FOR UPDATE
  `;
  const rated = (wallet: string): RatedPlayer => {
    const row = current.find((r) => r.playerPubkey === wallet);
    return {
      rating: row ? Number(row.rating) : INITIAL_RATING,
      games: row ? Number(row.ratedGames) : 0,
    };
  };
  const white = rated(whitePlayer);
  const black = rated(blackPlayer);
  const change = rateGame(white, black, whiteScore);
  await s`
    UPDATE matches
    SET white_rating = ${white.rating},
        black_rating = ${black.rating},
        white_rating_change = ${change.white},
        black_rating_change = ${change.black}
    WHERE match_id = ${matchId}
  `;

  const reasonCol =
    reason === "resignation"
      ? "wins_by_resignation"
      : reason === "timeout"
        ? "wins_by_timeout"
        : "wins_by_checkmate";

  const sides = [
    { wallet: whitePlayer, score: whiteScore, before: white.rating, delta: change.white },
    { wallet: blackPlayer, score: 1 - whiteScore, before: black.rating, delta: change.black },
  ];
  for (const side of sides) {
    const rating = side.before + side.delta;
    if (side.score === 1) {
      await s.unsafe(
        `
        INSERT INTO player_stats (
          player_pubkey, total_games, wins, ${reasonCol},
          current_streak, longest_win_streak, total_wagered, total_won, last_game_at,
          rating, peak_rating, rated_games
        ) VALUES ($1, 1, 1, 1, 1, 1, $2, $3, NOW(), $4, GREATEST($4, ${INITIAL_RATING}), 1)
        ON CONFLICT (player_pubkey) DO UPDATE SET
          total_games = player_stats.total_games + 1,
          wins = player_stats.wins + 1,
          ${reasonCol} = player_stats.${reasonCol} + 1,
          longest_win_streak = GREATEST(
            player_stats.longest_win_streak,
            CASE WHEN player_stats.current_streak >= 0
              THEN player_stats.current_streak + 1 ELSE 1 END
          ),
          current_streak = CASE WHEN player_stats.current_streak >= 0
            THEN player_stats.current_streak + 1 ELSE 1 END,
          total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
          total_won = player_stats.total_won + EXCLUDED.total_won,
          last_game_at = NOW(),
          rating = EXCLUDED.rating,
          peak_rating = GREATEST(player_stats.peak_rating, EXCLUDED.rating),
          rated_games = player_stats.rated_games + 1,
          updated_at = NOW()
      `,
        [side.wallet, bet, pot, rating]
      );
    } else if (side.score === 0) {
      await s.unsafe(
        `
        INSERT INTO player_stats (
          player_pubkey, total_games, losses, current_streak,
          total_wagered, last_game_at, rating, peak_rating, rated_games
        ) VALUES ($1, 1, 1, -1, $2, NOW(), $3, GREATEST($3, ${INITIAL_RATING}), 1)
        ON CONFLICT (player_pubkey) DO UPDATE SET
          total_games = player_stats.total_games + 1,
          losses = player_stats.losses + 1,
          current_streak = CASE WHEN player_stats.current_streak <= 0
            THEN player_stats.current_streak - 1 ELSE -1 END,
          total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
          last_game_at = NOW(),
          rating = EXCLUDED.rating,
          rated_games = player_stats.rated_games + 1,
          updated_at = NOW()
      `,
        [side.wallet, bet, rating]
      );
    } else {
      await s.unsafe(
        `
        INSERT INTO player_stats (
          player_pubkey, total_games, draws, current_streak,
          total_wagered, last_game_at, rating, peak_rating, rated_games
        ) VALUES ($1, 1, 1, 0, $2, NOW(), $3, GREATEST($3, ${INITIAL_RATING}), 1)
        ON CONFLICT (player_pubkey) DO UPDATE SET
          total_games = player_stats.total_games + 1,
          draws = player_stats.draws + 1,
          current_streak = 0,
          total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
          last_game_at = NOW(),
          rating = EXCLUDED.rating,
          peak_rating = GREATEST(player_stats.peak_rating, EXCLUDED.rating),
          rated_games = player_stats.rated_games + 1,
          updated_at = NOW()
      `,
        [side.wallet, bet, rating]
      );
    }
  }
  await awardGameXp(s, matchId);
}
