import type { FastifyInstance } from "fastify";
import { sql } from "../db/pool.js";
import { config } from "../config.js";
import {
  initMatch,
  applyMove,
  removeMatch,
  rebuildBoardState,
} from "../services/boardCache.js";

// ── Auth helper ──
function requireApiKey(request: { headers: Record<string, string | undefined> }): void {
  const key = request.headers["x-api-key"];
  if (!key || key !== config.apiKey) {
    throw { statusCode: 401, message: "Unauthorized — invalid or missing X-API-Key" };
  }
}

// ── Types for sync payloads ──

interface SyncMatchCreated {
  matchId: string;
  creator: string; // base58 pubkey
  bettingTokenMint: string;
  betAmount: number;
  moveTimeoutDuration: number;
  platformFeeBasisPoints: number;
  signature: string;
  slot: number;
}

interface SyncPlayerJoined {
  matchId: string;
  playerTwo: string;
  betAmountPerPlayer: number;
  signature: string;
  slot: number;
}

interface SyncMoveMade {
  matchId: string;
  player: string;
  playerColor: string; // "white" | "black"
  algebraicMove: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotionPiece: string | null;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  signature: string;
  slot: number;
}

interface SyncGameEnded {
  matchId: string;
  status: string; // "whiteWins" | "blackWins" | "draw"
  winner: string | null;
  reason: string;
  signature: string;
  slot: number;
}

interface SyncPayout {
  matchId: string;
  winner: string | null;
  whitePlayer: string | null;
  blackPlayer: string | null;
  amount: number;
  amountEach: number | null;
  fee: number;
  type: "win" | "draw";
  signature: string;
  slot: number;
}

// ── Helpers ──

// Map SDK enum values (camelCase) to DB enum values (PascalCase)
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

export function syncRoutes(app: FastifyInstance): void {
  // ── Match created ──
  app.post<{ Body: SyncMatchCreated }>(
    "/api/sync/match-created",
    async (request, reply) => {
      requireApiKey(request);
      const {
        matchId,
        creator,
        bettingTokenMint,
        betAmount,
        moveTimeoutDuration,
        platformFeeBasisPoints,
        signature,
        slot,
      } = request.body;

      await sql`
        INSERT INTO matches (
          match_id, white_player, betting_token_mint,
          bet_amount_per_player, total_pot, platform_fee_bps,
          move_timeout_seconds, last_webhook_slot, last_webhook_sig
        ) VALUES (
          ${matchId}, ${creator}, ${bettingTokenMint},
          ${betAmount}, ${betAmount}, ${platformFeeBasisPoints},
          ${moveTimeoutDuration}, ${slot}, ${signature}
        )
        ON CONFLICT (match_id) DO NOTHING
      `;

      // Init board cache
      const fen = initMatch(matchId);

      app.log.info({ matchId, creator }, "Match indexed");
      reply.send({ ok: true, fen });
    }
  );

  // ── Player joined ──
  app.post<{ Body: SyncPlayerJoined }>(
    "/api/sync/player-joined",
    async (request, reply) => {
      requireApiKey(request);
      const {
        matchId,
        playerTwo,
        betAmountPerPlayer,
        signature,
        slot,
      } = request.body;

      await sql`
        UPDATE matches
        SET black_player = ${playerTwo},
            total_pot = total_pot + ${betAmountPerPlayer},
            game_status = 'Active',
            started_at = NOW(),
            last_move_at = NOW(),
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${matchId}
      `;

      app.log.info({ matchId, playerTwo }, "Player joined indexed");
      reply.send({ ok: true });
    }
  );

  // ── Move made ──
  app.post<{ Body: SyncMoveMade }>(
    "/api/sync/move-made",
    async (request, reply) => {
      requireApiKey(request);
      const {
        matchId,
        player,
        playerColor,
        algebraicMove,
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotionPiece,
        isCheck,
        isCheckmate,
        isStalemate,
        signature,
        slot,
      } = request.body;

      // Apply move to board cache, get FEN
      let fen = applyMove(matchId, {
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotionPiece: promotionPiece || null,
        playerColor: playerColor === "white" ? "white" : "black",
      });

      if (!fen) {
        // Cache miss — rebuild from DB moves replay, then apply this move
        fen = await rebuildBoardState(
          matchId,
          {
            fromRow,
            fromCol,
            toRow,
            toCol,
            promotionPiece: promotionPiece || null,
            playerColor: playerColor === "white" ? "white" : "black",
          },
          (queryStr: string, ...params: unknown[]) =>
            sql.unsafe(queryStr, ...params as any)
        );
      }

      // Get next move number
      const count = await sql`
        SELECT COUNT(*) as cnt FROM moves WHERE match_id = ${matchId}
      `;
      const moveNumber = Number(count[0]?.cnt ?? 0) + 1;

      // Color to DB format
      const dbColor =
        playerColor === "white" ? "White" : "Black";

      await sql`
        INSERT INTO moves (
          match_id, move_number, player_pubkey, player_color,
          from_row, from_col, to_row, to_col,
          algebraic_move, promotion_piece, fen_after_move,
          is_check, is_checkmate, is_stalemate,
          event_slot, event_signature
        ) VALUES (
          ${matchId}, ${moveNumber}, ${player}, ${dbColor},
          ${fromRow}, ${fromCol}, ${toRow}, ${toCol},
          ${algebraicMove}, ${promotionPiece ?? null}, ${fen ?? ""},
          ${isCheck}, ${isCheckmate}, ${isStalemate},
          ${slot}, ${signature}
        )
        ON CONFLICT (event_signature) DO NOTHING
      `;

      // Update match timestamp
      await sql`
        UPDATE matches
        SET last_move_at = NOW(),
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${matchId}
      `;

      app.log.info(
        { matchId, moveNumber, algebraicMove },
        "Move indexed"
      );
      reply.send({ ok: true, fen, moveNumber });
    }
  );

  // ── Game ended ──
  app.post<{ Body: SyncGameEnded }>(
    "/api/sync/game-ended",
    async (request, reply) => {
      requireApiKey(request);
      const { matchId, status, winner, reason, signature, slot } =
        request.body;

      const dbStatus = gameStatusToDb[status] || status;
      const dbReason = gameEndReasonToDb[reason] || reason;

      await sql`
        UPDATE matches
        SET game_status = ${dbStatus},
            game_end_reason = ${dbReason},
            ended_at = NOW(),
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${matchId}
      `;

      // Update player stats
      await updatePlayerStats(matchId, status, winner, reason);

      // Clean up board cache
      removeMatch(matchId);

      app.log.info(
        { matchId, status, reason },
        "Game end indexed"
      );
      reply.send({ ok: true });
    }
  );

  // ── Payout processed ──
  app.post<{ Body: SyncPayout }>(
    "/api/sync/payout",
    async (request, reply) => {
      requireApiKey(request);
      const { matchId, signature, slot } = request.body;

      await sql`
        UPDATE matches
        SET payout_processed = TRUE,
            payout_tx_signature = ${signature},
            last_webhook_slot = ${slot},
            last_webhook_sig = ${signature}
        WHERE match_id = ${matchId}
      `;

      app.log.info({ matchId }, "Payout indexed");
      reply.send({ ok: true });
    }
  );
}

// ── Player stats update ──

async function updatePlayerStats(
  matchId: string,
  status: string,
  winner: string | null,
  reason: string
): Promise<void> {
  const match = await sql`
    SELECT white_player, black_player, bet_amount_per_player, total_pot
    FROM matches WHERE match_id = ${matchId}
  `;
  if (match.length === 0) return;

  const { whitePlayer, blackPlayer, betAmountPerPlayer, totalPot } =
    match[0] as Record<string, string>;

  const white = whitePlayer as string;
  const black = blackPlayer as string;
  const bet = Number(betAmountPerPlayer ?? 0);
  const pot = Number(totalPot ?? 0);

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
    await sql.unsafe(`
      INSERT INTO player_stats (
        player_pubkey, total_games, wins, ${reasonCol},
        current_streak, total_wagered, total_won, last_game_at
      ) VALUES (
        '${winnerPubkey}', 1, 1, 1,
        1, ${bet}, ${pot}, NOW()
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
        total_wagered = player_stats.total_wagered + ${bet},
        total_won = player_stats.total_won + ${pot},
        last_game_at = NOW(),
        updated_at = NOW()
    `);
  }

  // Update loser
  if (loserPubkey) {
    await sql.unsafe(`
      INSERT INTO player_stats (
        player_pubkey, total_games, losses, current_streak,
        total_wagered, last_game_at
      ) VALUES (
        '${loserPubkey}', 1, 1, -1,
        ${bet}, NOW()
      )
      ON CONFLICT (player_pubkey) DO UPDATE SET
        total_games = player_stats.total_games + 1,
        losses = player_stats.losses + 1,
        current_streak = CASE WHEN player_stats.current_streak <= 0
          THEN player_stats.current_streak - 1 ELSE -1 END,
        total_wagered = player_stats.total_wagered + ${bet},
        last_game_at = NOW(),
        updated_at = NOW()
    `);
  }

  // Draw
  if (status === "draw") {
    for (const pubkey of [white, black]) {
      if (!pubkey) continue;
      await sql.unsafe(`
        INSERT INTO player_stats (
          player_pubkey, total_games, draws,
          total_wagered, last_game_at
        ) VALUES (
          '${pubkey}', 1, 1,
          ${bet}, NOW()
        )
        ON CONFLICT (player_pubkey) DO UPDATE SET
          total_games = player_stats.total_games + 1,
          draws = player_stats.draws + 1,
          total_wagered = player_stats.total_wagered + ${bet},
          last_game_at = NOW(),
          updated_at = NOW()
      `);
    }
  }
}
