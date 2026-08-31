import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Sql } from "postgres";
import { sql } from "../db/pool.js";
import { config } from "../config.js";
import {
  initMatch,
  removeMatch,
} from "../services/boardCache.js";
import {
  verifyProgramEvent,
  type VerifiedProgramEvent,
} from "../services/transactionVerifier.js";
import type {
  MatchNotification,
  MatchRealtimeHub,
} from "../services/matchRealtime.js";
import { syncAuthMode } from "../services/syncAuth.js";

// ── Auth helper ──
function authorizeSyncRequest(request: {
  headers: Record<string, string | string[] | undefined>;
}): void {
  const raw = request.headers["x-api-key"];
  if (syncAuthMode(raw, config.apiKey) === "invalid") {
    throw { statusCode: 401, message: "Unauthorized — invalid X-API-Key" };
  }
}

// ── Rate limiter (per-IP, sliding window) ──
const syncRateLimits = new Map<string, { windowStart: number; count: number }>();
const MAX_SYNC_RATE_LIMIT_ENTRIES = 4096;

function enforceSyncRateLimit(ip: string): void {
  const now = Date.now();
  const current = syncRateLimits.get(ip);
  if (!current || now - current.windowStart >= 60_000) {
    syncRateLimits.set(ip, { windowStart: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 60) {
    throw { statusCode: 429, message: "Sync rate limit exceeded" };
  }
}

// Periodic cleanup of expired rate limit entries
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of syncRateLimits) {
    if (entry.windowStart < cutoff) syncRateLimits.delete(key);
  }
  // Hard cap: if still too large, clear all
  if (syncRateLimits.size > MAX_SYNC_RATE_LIMIT_ENTRIES) {
    syncRateLimits.clear();
  }
}, 60_000).unref();

interface SyncRequest {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
  eventIndex?: number;
}

const syncBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["matchId", "signature"],
  properties: {
    matchId: { type: "string", minLength: 1, maxLength: 32 },
    signature: {
      type: "string",
      minLength: 64,
      maxLength: 88,
      pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
    },
    runtimeEndpoint: { type: "string", maxLength: 255 },
    eventIndex: { type: "integer", minimum: 0 },
  },
} as const;

function assertMatchId(matchId: string): void {
  if (Buffer.byteLength(matchId, "utf8") > 32) {
    throw { statusCode: 400, message: "matchId must be at most 32 UTF-8 bytes" };
  }
}

function eventAs<T extends VerifiedProgramEvent["name"]>(
  event: VerifiedProgramEvent,
  name: T
): Extract<VerifiedProgramEvent, { name: T }> {
  if (event.name !== name) throw new Error(`Expected ${name}, received ${event.name}`);
  return event as Extract<VerifiedProgramEvent, { name: T }>;
}

// ── Helpers ──

const gameStatusToDb: Record<string, string> = {
  whiteWins: "WhiteWins",
  blackWins: "BlackWins",
  draw: "Draw",
  waitingForOpponent: "WaitingForOpponent",
  active: "Active",
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

type SyncEventType =
  | "match-created"
  | "player-joined"
  | "move-made"
  | "game-ended"
  | "payout"
  | "match-aborted";

async function claimEvent(
  s: Sql,
  eventType: SyncEventType,
  matchId: string,
  signature: string,
  slot: number,
  eventIndex: number
): Promise<boolean> {
  const rows = await s`
    INSERT INTO sync_events (
      event_signature, event_type, match_id, event_slot, event_index
    ) VALUES (${signature}, ${eventType}, ${matchId}, ${slot}, ${eventIndex})
    ON CONFLICT (event_signature, event_type, match_id, event_index) DO NOTHING
    RETURNING event_signature
  `;
  return rows.length === 1;
}

async function notifyRealtime(
  app: FastifyInstance,
  realtime: MatchRealtimeHub | undefined,
  matchId: string,
  notification: MatchNotification
): Promise<void> {
  if (!realtime) return;
  try {
    await realtime.refresh(matchId, notification);
  } catch (error) {
    // Indexing already committed. Realtime polling will reconcile shortly.
    app.log.error({ error, matchId }, "Realtime notification failed");
  }
}

function confirmedAt(blockTime: number | null): Date {
  return blockTime === null ? new Date() : new Date(blockTime * 1000);
}

export function syncRoutes(
  app: FastifyInstance,
  realtime?: MatchRealtimeHub
): void {
  // ── Match created ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/match-created",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const { matchId, signature, runtimeEndpoint, eventIndex: requestedEventIndex } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["MatchCreatedEvent"],
      });
      const event = eventAs(verified.event, "MatchCreatedEvent");
      const slot = verified.slot;
      const eventIndex = verified.eventIndex;

      const inserted = await sql.begin(async (tx) => {
        const claimed = await claimEvent(
          tx as unknown as Sql,
          "match-created",
          matchId,
          signature,
          slot,
          eventIndex
        );
        if (!claimed) return false;

        const rows = await tx`
          INSERT INTO matches (
            match_id, white_player, betting_token_mint,
            bet_amount_per_player, total_pot, platform_fee_bps,
            move_timeout_seconds, last_webhook_slot, last_webhook_sig
          ) VALUES (
            ${matchId}, ${event.creator}, ${event.bettingTokenMint},
            ${event.betAmount}, ${event.betAmount}, ${event.platformFeeBasisPoints},
            ${event.moveTimeoutDuration}, ${slot}, ${signature}
          )
          ON CONFLICT (match_id) DO NOTHING
          RETURNING match_id
        `;
        return rows.length === 1;
      });

      if (!inserted) {
        return reply.send({ ok: true, duplicate: true });
      }

      const fen = initMatch(matchId);

      await notifyRealtime(app, realtime, matchId, {
        type: "match-created",
        creator: event.creator,
        signature,
      });

      app.log.info({ matchId, creator: event.creator }, "Match indexed");
      reply.send({ ok: true, fen });
    }
  );

  // ── Player joined ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/player-joined",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const { matchId, signature, runtimeEndpoint, eventIndex: requestedEventIndex } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["PlayerJoinedEvent"],
      });
      const event = eventAs(verified.event, "PlayerJoinedEvent");
      const slot = verified.slot;
      const eventIndex = verified.eventIndex;
      const joinedAt = confirmedAt(verified.blockTime);

      const updated = await sql.begin(async (tx) => {
        const claimed = await claimEvent(
          tx as unknown as Sql,
          "player-joined",
          matchId,
          signature,
          slot,
          eventIndex
        );
        if (!claimed) return "duplicate" as const;

        const rows = await tx`
          UPDATE matches
          SET black_player = ${event.playerTwo},
              total_pot = bet_amount_per_player * 2,
              game_status = 'Active',
              started_at = ${joinedAt},
              last_move_at = ${joinedAt},
              last_webhook_slot = ${slot},
              last_webhook_sig = ${signature}
          WHERE match_id = ${matchId}
            AND game_status = 'WaitingForOpponent'
            AND black_player IS NULL
            AND white_player = ${event.playerOne}
            AND betting_token_mint = ${event.bettingTokenMint}
            AND bet_amount_per_player = ${event.betAmountPerPlayer}
          RETURNING match_id
        `;
        if (rows.length === 0) {
          throw { statusCode: 409, message: "Match is missing or already joined" };
        }
        return "updated" as const;
      });

      if (updated === "duplicate") {
        return reply.send({ ok: true, duplicate: true });
      }

      await notifyRealtime(app, realtime, matchId, {
        type: "player-joined",
        whitePlayer: event.playerOne,
        blackPlayer: event.playerTwo,
        signature,
      });

      app.log.info({ matchId, playerTwo: event.playerTwo }, "Player joined indexed");
      reply.send({ ok: true });
    }
  );

  // ── Match aborted before an opponent joined ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/match-aborted",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const {
        matchId,
        signature,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
      } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["MatchAbortedEvent"],
      });
      const event = eventAs(verified.event, "MatchAbortedEvent");

      const updated = await sql.begin(async (tx) => {
        const claimed = await claimEvent(
          tx as unknown as Sql,
          "match-aborted",
          matchId,
          signature,
          verified.slot,
          verified.eventIndex
        );
        if (!claimed) return false;

        const rows = await tx`
          UPDATE matches
          SET game_status = 'Aborted',
              game_end_reason = 'Aborted',
              payout_processed = TRUE,
              ended_at = NOW(),
              last_webhook_slot = ${verified.slot},
              last_webhook_sig = ${signature}
          WHERE match_id = ${matchId}
            AND game_status = 'WaitingForOpponent'
            AND white_player = ${event.creator}
          RETURNING match_id
        `;
        if (rows.length === 0) {
          throw { statusCode: 409, message: "Match is missing or cannot be aborted" };
        }
        return true;
      });

      if (!updated) return reply.send({ ok: true, duplicate: true });
      removeMatch(matchId);
      await notifyRealtime(app, realtime, matchId, {
        type: "match-aborted",
        creator: event.creator,
        signature,
      });
      app.log.info({ matchId }, "Match abort indexed");
      return reply.send({ ok: true });
    }
  );

  // ── Move made ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/move-made",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const { matchId, signature, runtimeEndpoint, eventIndex: requestedEventIndex } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["MoveMadeEvent"],
      });
      const event = eventAs(verified.event, "MoveMadeEvent");
      const slot = verified.slot;
      const eventIndex = verified.eventIndex;
      const movedAt = confirmedAt(verified.blockTime);

      let result: { duplicate: boolean; fen: string | null; moveNumber: number };
      try {
        result = await sql.begin(async (tx) => {
          const claimed = await claimEvent(
            tx as unknown as Sql,
            "move-made",
            matchId,
            signature,
            slot,
            eventIndex
          );
          if (!claimed) {
            const existing = await tx`
              SELECT move_number, fen_after_move
              FROM moves
              WHERE event_signature = ${signature}
                AND match_id = ${matchId}
                AND event_index = ${eventIndex}
            `;
            return {
              duplicate: true,
              fen: (existing[0]?.fenAfterMove as string | undefined) ?? null,
              moveNumber: Number(existing[0]?.moveNumber ?? 0),
            };
          }

          const matches = await tx`
            SELECT match_id, last_move_slot, last_move_signature,
                   last_move_event_index
            FROM matches WHERE match_id = ${matchId} FOR UPDATE
          `;
          if (matches.length === 0) {
            throw { statusCode: 409, message: "Match must be indexed before its moves" };
          }
          const lastMoveSlot = matches[0]?.lastMoveSlot;
          const sameTransaction =
            matches[0]?.lastMoveSignature === signature;
          const staleSlot =
            lastMoveSlot != null && BigInt(slot) < BigInt(String(lastMoveSlot));
          const staleEventInTransaction =
            sameTransaction &&
            matches[0]?.lastMoveEventIndex != null &&
            eventIndex <= Number(matches[0].lastMoveEventIndex);
          if (staleSlot || staleEventInTransaction) {
            throw {
              statusCode: 409,
              message: "Move event is stale or out of order; replay from the earliest missing move",
            };
          }

          const latest = await tx`
            SELECT COALESCE(MAX(move_number), 0) AS move_number
            FROM moves WHERE match_id = ${matchId}
          `;
          const moveNumber = Number(latest[0]?.moveNumber ?? 0) + 1;
          const dbColor = event.playerColor === "white" ? "White" : "Black";

          await tx`
            INSERT INTO moves (
              match_id, move_number, player_pubkey, player_color,
              from_row, from_col, to_row, to_col,
              algebraic_move, promotion_piece, fen_after_move,
              is_check, is_checkmate, is_stalemate,
              event_slot, event_signature, event_index
            ) VALUES (
              ${matchId}, ${moveNumber}, ${event.player}, ${dbColor},
              ${event.fromRow}, ${event.fromCol}, ${event.toRow}, ${event.toCol},
              ${event.algebraicMove}, ${event.promotionPiece}, ${event.boardFen},
              ${event.isCheck}, ${event.isCheckmate}, ${event.isStalemate},
              ${slot}, ${signature}, ${eventIndex}
            )
          `;

          await tx`
            UPDATE matches
            SET current_fen = ${event.boardFen},
                last_move_slot = ${slot},
                last_move_signature = ${signature},
                last_move_event_index = ${eventIndex},
                last_move_at = ${movedAt},
                last_webhook_slot = ${slot},
                last_webhook_sig = ${signature}
            WHERE match_id = ${matchId}
          `;

          return { duplicate: false, fen: event.boardFen, moveNumber };
        });
      } catch (error) {
        // A rolled-back write must not leave process-local state ahead of Postgres.
        removeMatch(matchId);
        throw error;
      }

      app.log.info(
        { matchId, moveNumber: result.moveNumber, algebraicMove: event.algebraicMove },
        "Move indexed"
      );
      if (!result.duplicate) {
        await notifyRealtime(app, realtime, matchId, {
          type: "move-made",
          moveNumber: result.moveNumber,
          algebraicMove: event.algebraicMove,
          player: event.player,
          playerColor: event.playerColor,
          signature,
        });
      }
      reply.send({
        ok: true,
        duplicate: result.duplicate || undefined,
        fen: result.fen,
        moveNumber: result.moveNumber,
      });
    }
  );

  // ── Game ended ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/game-ended",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const { matchId, signature, runtimeEndpoint, eventIndex: requestedEventIndex } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["GameEndedEvent"],
      });
      const event = eventAs(verified.event, "GameEndedEvent");
      const slot = verified.slot;
      const eventIndex = verified.eventIndex;

      const dbStatus = gameStatusToDb[event.status];
      const dbReason = gameEndReasonToDb[event.reason];
      if (!dbStatus || !dbReason) {
        throw { statusCode: 422, message: "Unsupported terminal event values" };
      }

      const updated = await sql.begin(async (tx) => {
        const claimed = await claimEvent(
          tx as unknown as Sql,
          "game-ended",
          matchId,
          signature,
          slot,
          eventIndex
        );
        if (!claimed) return false;

        const rows = await tx`
          UPDATE matches
          SET game_status = ${dbStatus},
              game_end_reason = ${dbReason},
              ended_at = NOW(),
              last_webhook_slot = ${slot},
              last_webhook_sig = ${signature}
          WHERE match_id = ${matchId}
            AND game_status = 'Active'
          RETURNING match_id
        `;
        if (rows.length === 0) {
          throw { statusCode: 409, message: "Match is missing or already ended" };
        }

        await updatePlayerStats(
          tx as unknown as Sql,
          matchId,
          event.status,
          event.reason
        );
        return true;
      });

      if (!updated) {
        return reply.send({ ok: true, duplicate: true });
      }

      // Clean up board cache
      removeMatch(matchId);

      await notifyRealtime(app, realtime, matchId, {
        type: "game-ended",
        status: dbStatus,
        reason: dbReason,
        winner: event.winner,
        signature,
      });

      app.log.info(
        { matchId, status: event.status, reason: event.reason },
        "Game end indexed"
      );
      reply.send({ ok: true });
    }
  );

  // ── Payout processed ──
  app.post<{ Body: SyncRequest }>(
    "/api/sync/payout",
    { schema: { body: syncBodySchema } },
    async (request, reply) => {
      authorizeSyncRequest(request);
      enforceSyncRateLimit(request.ip);
      const { matchId, signature, runtimeEndpoint, eventIndex: requestedEventIndex } = request.body;
      assertMatchId(matchId);
      const verified = await verifyProgramEvent({
        signature,
        matchId,
        runtimeEndpoint,
        eventIndex: requestedEventIndex,
        eventNames: ["PayoutEvent", "DrawPayoutEvent"],
      });
      const slot = verified.slot;
      const eventIndex = verified.eventIndex;

      const updated = await sql.begin(async (tx) => {
        const claimed = await claimEvent(
          tx as unknown as Sql,
          "payout",
          matchId,
          signature,
          slot,
          eventIndex
        );
        if (!claimed) return false;

        const rows = await tx`
          UPDATE matches
          SET payout_processed = TRUE,
              payout_tx_signature = ${signature},
              last_webhook_slot = ${slot},
              last_webhook_sig = ${signature}
          WHERE match_id = ${matchId}
            AND payout_processed = FALSE
          RETURNING match_id
        `;
        if (rows.length === 0) {
          throw { statusCode: 409, message: "Match is missing or payout is already indexed" };
        }
        return true;
      });

      if (!updated) {
        return reply.send({ ok: true, duplicate: true });
      }

      await notifyRealtime(app, realtime, matchId, {
        type: "payout-processed",
        signature,
      });

      app.log.info({ matchId }, "Payout indexed");
      reply.send({ ok: true });
    }
  );
}

// ── Player stats update ──

async function updatePlayerStats(
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

  const white = whitePlayer as string;
  const black = blackPlayer as string;
  const bet = String(betAmountPerPlayer ?? "0");
  const pot = String(totalPot ?? "0");

  // Determine winner/loser
  let winnerPubkey: string | null = null;
  let loserPubkey: string | null = null;

  if (status === "whiteWins") {
    winnerPubkey = white;
    loserPubkey = black;
  } else if (status === "blackWins") {
    winnerPubkey = black;
    loserPubkey = white;
  }

  const winReasonColumn = (r: string): string => {
    switch (r) {
      case "checkmate":
        return "wins_by_checkmate";
      case "resignation":
        return "wins_by_resignation";
      case "timeout":
        return "wins_by_timeout";
      default:
        return "wins_by_checkmate";
    }
  };

  // Update winner
  if (winnerPubkey) {
    const reasonCol = winReasonColumn(reason);
    await s.unsafe(`
      INSERT INTO player_stats (
        player_pubkey, total_games, wins, ${reasonCol},
        current_streak, total_wagered, total_won, last_game_at
      ) VALUES (
        $1, 1, 1, 1,
        1, $2, $3, NOW()
      )
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
        updated_at = NOW()
    `, [winnerPubkey, bet, pot]);
  }

  // Update loser
  if (loserPubkey) {
    await s.unsafe(`
      INSERT INTO player_stats (
        player_pubkey, total_games, losses, current_streak,
        total_wagered, last_game_at
      ) VALUES (
        $1, 1, 1, -1,
        $2, NOW()
      )
      ON CONFLICT (player_pubkey) DO UPDATE SET
        total_games = player_stats.total_games + 1,
        losses = player_stats.losses + 1,
        current_streak = CASE WHEN player_stats.current_streak <= 0
          THEN player_stats.current_streak - 1 ELSE -1 END,
        total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
        last_game_at = NOW(),
        updated_at = NOW()
    `, [loserPubkey, bet]);
  }

  // Draw
  if (status === "draw") {
    for (const pubkey of [white, black]) {
      if (!pubkey) continue;
      await s.unsafe(`
        INSERT INTO player_stats (
          player_pubkey, total_games, draws,
          total_wagered, last_game_at
        ) VALUES (
          $1, 1, 1,
          $2, NOW()
        )
        ON CONFLICT (player_pubkey) DO UPDATE SET
          total_games = player_stats.total_games + 1,
          draws = player_stats.draws + 1,
          total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
          last_game_at = NOW(),
          updated_at = NOW()
      `, [pubkey, bet]);
    }
  }
}
