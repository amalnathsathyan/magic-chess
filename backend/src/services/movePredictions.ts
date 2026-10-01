import type { Sql } from "postgres";
import { Chess } from "chess.js";
import { sql } from "../db/pool.js";
import type { LiveMatchState } from "./matchState.js";

/**
 * Live move predictions ("what will the next move be?") paid in play points.
 *
 * Integrity rules:
 * - A prediction for ply N is accepted only while the authoritative runtime
 *   (the MagicBlock ER while delegated) shows fewer than N plies played. The
 *   check reads the chain at request time, never the lagging index.
 * - As a second line, any prediction recorded at or after the move's confirmed
 *   block time is refunded at settlement, so nothing placed after confirmation
 *   can win.
 * - Match players cannot predict their own match.
 * - Markets settle parimutuel per ply from the verified MoveMade event; if the
 *   game ends first, remaining markets are voided and refunded.
 */

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface PredictionConfig {
  startingBalance: number;
  minStake: number;
  maxStake: number;
  maxPliesAhead: number;
  refillThreshold: number;
  refillBalance: number;
}

export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  startingBalance: 1_000,
  minStake: 10,
  maxStake: 500,
  maxPliesAhead: 10,
  refillThreshold: 50,
  refillBalance: 500,
};

export class PredictionError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "invalid_prediction"
  ) {
    super(message);
    this.name = "PredictionError";
  }
}

// ── Pure helpers (unit tested) ────────────────────────────────────────────

const SAN_PATTERN =
  /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|(?:[a-h]x)?[a-h][1-8](?:=[QRBN])?)$/;

/** Canonical SAN for comparison: no check/annotation marks, 0-0 → O-O. */
export function normalizeSan(raw: string): string {
  return raw
    .trim()
    .replace(/0/g, "O")
    .replace(/[+#!?]+$/g, "")
    .replace(/^([a-h]x?[a-h]?[18])([QRBN])$/, "$1=$2");
}

export function isValidSan(raw: string): boolean {
  return SAN_PATTERN.test(normalizeSan(raw));
}

/** SAN for a coordinate move ("e2e4", "e7e8q") from the position before it. */
export function sanFromUci(fenBefore: string, uci: string): string | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(uci.trim());
  if (!match) return null;
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move({
      from: match[1].toLowerCase(),
      to: match[2].toLowerCase(),
      promotion: match[3]?.toLowerCase(),
    });
    return move ? normalizeSan(move.san) : null;
  } catch {
    return null;
  }
}

/** Legal SAN moves in a position, or null when the FEN can't be loaded. */
export function legalSans(fen: string): Set<string> | null {
  try {
    return new Set(new Chess(fen).moves().map(normalizeSan));
  } catch {
    return null;
  }
}

export interface BetForSettlement {
  id: number;
  wallet: string;
  predictedSan: string;
  stake: number;
  createdAtMs: number;
}

export type BetOutcome = { id: number; wallet: string; status: "won" | "lost" | "refunded"; payout: number; stake: number };

/**
 * Parimutuel settlement for one ply. Bets placed at/after the confirmed move
 * time are refunded. Winners split the losers' pool pro rata to stake (floor;
 * dust is burned). With no winners, or nobody to win from, everyone is
 * refunded so a market never burns points for lack of counterparties.
 */
export function settleBets(
  bets: BetForSettlement[],
  actualSan: string,
  confirmedAtMs: number | null
): BetOutcome[] {
  const actual = normalizeSan(actualSan);
  const late = (bet: BetForSettlement) =>
    confirmedAtMs !== null && bet.createdAtMs >= confirmedAtMs;
  const eligible = bets.filter((bet) => !late(bet));
  const winners = eligible.filter((bet) => normalizeSan(bet.predictedSan) === actual);
  const losers = eligible.filter((bet) => normalizeSan(bet.predictedSan) !== actual);
  const winnersPool = winners.reduce((sum, bet) => sum + bet.stake, 0);
  const losersPool = losers.reduce((sum, bet) => sum + bet.stake, 0);
  const refundAll = winners.length === 0 || losers.length === 0;

  return bets.map((bet) => {
    if (late(bet) || (refundAll && !winners.includes(bet))) {
      return { id: bet.id, wallet: bet.wallet, stake: bet.stake, status: "refunded", payout: bet.stake };
    }
    if (winners.includes(bet)) {
      const share = refundAll ? 0 : Math.floor((losersPool * bet.stake) / winnersPool);
      return { id: bet.id, wallet: bet.wallet, stake: bet.stake, status: "won", payout: bet.stake + share };
    }
    return { id: bet.id, wallet: bet.wallet, stake: bet.stake, status: "lost", payout: 0 };
  });
}

// ── Service ──────────────────────────────────────────────────────────────

export interface MarketOption {
  san: string;
  stake: number;
  bettors: number;
}

export interface PlyMarket {
  ply: number;
  status: "open" | "settled" | "void";
  pool: number;
  bettors: number;
  options: MarketOption[];
  actualSan: string | null;
}

export interface MarketSnapshot {
  matchId: string;
  pliesPlayed: number;
  nextPly: number;
  maxPly: number;
  open: boolean;
  markets: PlyMarket[];
}

export interface PredictionAccount {
  wallet: string;
  balance: number;
  totalStaked: number;
  totalWon: number;
  betsWon: number;
  betsLost: number;
}

export interface MyBet {
  matchId: string;
  ply: number;
  predictedSan: string;
  stake: number;
  status: string;
  payout: number;
  createdAt: string;
}

interface ServiceDeps {
  readLiveState: (matchId: string) => Promise<LiveMatchState | null>;
  publish?: (matchId: string, event: string, data: unknown) => void;
  config?: Partial<PredictionConfig>;
}

export class MovePredictionService {
  readonly config: PredictionConfig;

  constructor(private readonly deps: ServiceDeps) {
    this.config = { ...DEFAULT_PREDICTION_CONFIG, ...deps.config };
  }

  async getAccount(wallet: string): Promise<PredictionAccount> {
    await sql`
      INSERT INTO prediction_accounts (wallet, balance)
      VALUES (${wallet}, ${this.config.startingBalance})
      ON CONFLICT (wallet) DO NOTHING
    `;
    // Daily refill so a broke spectator can keep playing.
    const rows = await sql`
      UPDATE prediction_accounts
      SET balance = CASE
            WHEN balance < ${this.config.refillThreshold}
              AND (last_refill_at IS NULL OR last_refill_at < NOW() - INTERVAL '1 day')
              AND NOT EXISTS (
                SELECT 1 FROM move_bets b WHERE b.wallet = ${wallet} AND b.status = 'open'
              )
            THEN ${this.config.refillBalance}
            ELSE balance END,
          last_refill_at = CASE
            WHEN balance < ${this.config.refillThreshold}
              AND (last_refill_at IS NULL OR last_refill_at < NOW() - INTERVAL '1 day')
              AND NOT EXISTS (
                SELECT 1 FROM move_bets b WHERE b.wallet = ${wallet} AND b.status = 'open'
              )
            THEN NOW()
            ELSE last_refill_at END
      WHERE wallet = ${wallet}
      RETURNING wallet, balance, total_staked, total_won, bets_won, bets_lost
    `;
    return toAccount(rows[0]);
  }

  async myBets(wallet: string, matchId?: string): Promise<MyBet[]> {
    const rows = matchId
      ? await sql`
          SELECT match_id, ply, predicted_san, stake, status, payout, created_at
          FROM move_bets WHERE wallet = ${wallet} AND match_id = ${matchId}
          ORDER BY ply DESC LIMIT 50`
      : await sql`
          SELECT match_id, ply, predicted_san, stake, status, payout, created_at
          FROM move_bets WHERE wallet = ${wallet}
          ORDER BY created_at DESC LIMIT 50`;
    return rows.map((row) => ({
      matchId: String(row.matchId),
      ply: Number(row.ply),
      predictedSan: String(row.predictedSan),
      stake: Number(row.stake),
      status: String(row.status),
      payout: Number(row.payout),
      createdAt: new Date(row.createdAt as string).toISOString(),
    }));
  }

  async placeBet(args: {
    wallet: string;
    matchId: string;
    ply: number;
    san: string;
    stake: number;
  }): Promise<{ account: PredictionAccount; snapshot: MarketSnapshot }> {
    const { wallet, matchId, ply, stake } = args;
    const san = normalizeSan(args.san);
    if (!Number.isSafeInteger(ply) || ply < 1) throw new PredictionError("Choose a valid move number.");
    if (!isValidSan(san)) throw new PredictionError("Enter a move in algebraic notation, e.g. e4, Nf3, O-O.");
    if (
      !Number.isSafeInteger(stake) ||
      stake < this.config.minStake ||
      stake > this.config.maxStake
    ) {
      throw new PredictionError(
        `Stake between ${this.config.minStake} and ${this.config.maxStake} points.`
      );
    }

    const matchRows = await sql`
      SELECT white_player, black_player, game_status, current_fen
      FROM matches WHERE match_id = ${matchId}
    `;
    const indexed = matchRows[0];
    if (!indexed) throw new PredictionError("This match isn't live yet.", 404, "not_found");
    if (wallet === indexed.whitePlayer || wallet === indexed.blackPlayer) {
      throw new PredictionError("Players can't predict moves in their own match.", 403, "player");
    }

    // Authoritative lock check against the live runtime.
    const live = await this.deps.readLiveState(matchId);
    if (!live || live.gameStatus !== "active") {
      throw new PredictionError("Predictions open once the game is in progress.", 409, "closed");
    }
    if (live.players.includes(wallet)) {
      throw new PredictionError("Players can't predict moves in their own match.", 403, "player");
    }
    if (ply <= live.pliesPlayed) {
      throw new PredictionError(
        "That move has already been played — predictions for it are locked.",
        409,
        "locked"
      );
    }
    if (ply > live.pliesPlayed + this.config.maxPliesAhead) {
      throw new PredictionError(
        `You can predict up to ${this.config.maxPliesAhead} moves ahead.`
      );
    }
    // For the very next move we know the position: reject illegal moves.
    if (ply === live.pliesPlayed + 1) {
      const fen = String(indexed.currentFen ?? INITIAL_FEN);
      const fenIsCurrent = plyOfFen(fen) === live.pliesPlayed;
      const legal = fenIsCurrent ? legalSans(fen) : null;
      if (legal && !legal.has(san)) {
        throw new PredictionError(`${san} isn't a legal move in the current position.`);
      }
    }
    await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      await tx`
        INSERT INTO prediction_accounts (wallet, balance)
        VALUES (${wallet}, ${this.config.startingBalance})
        ON CONFLICT (wallet) DO NOTHING
      `;
      const debited = await tx`
        UPDATE prediction_accounts
        SET balance = balance - ${stake},
            total_staked = total_staked + ${stake},
            updated_at = NOW()
        WHERE wallet = ${wallet} AND balance >= ${stake}
        RETURNING balance
      `;
      if (debited.length === 0) {
        throw new PredictionError("Not enough points for that stake.", 402, "insufficient");
      }
      const inserted = await tx`
        INSERT INTO move_bets (match_id, ply, wallet, predicted_san, stake)
        VALUES (${matchId}, ${ply}, ${wallet}, ${san}, ${stake})
        ON CONFLICT (match_id, ply, wallet) DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) {
        throw new PredictionError(
          "You already predicted this move. Cancel it first to change your pick.",
          409,
          "duplicate"
        );
      }
    });

    const snapshot = await this.snapshot(matchId, live.pliesPlayed);
    this.deps.publish?.(matchId, "prediction.market", snapshot);
    return { account: await this.getAccount(wallet), snapshot };
  }

  async cancelBet(args: { wallet: string; matchId: string; ply: number }) {
    const live = await this.deps.readLiveState(args.matchId);
    if (!live) throw new PredictionError("Match not found.", 404, "not_found");
    if (args.ply <= live.pliesPlayed) {
      throw new PredictionError("That move has been played; the prediction is locked.", 409, "locked");
    }
    const cancelled = await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const rows = await tx`
        DELETE FROM move_bets
        WHERE match_id = ${args.matchId} AND ply = ${args.ply}
          AND wallet = ${args.wallet} AND status = 'open'
        RETURNING stake
      `;
      if (rows.length === 0) return false;
      const stake = Number(rows[0].stake);
      await tx`
        UPDATE prediction_accounts
        SET balance = balance + ${stake},
            total_staked = total_staked - ${stake},
            updated_at = NOW()
        WHERE wallet = ${args.wallet}
      `;
      return true;
    });
    if (!cancelled) throw new PredictionError("No open prediction to cancel.", 404, "not_found");
    const snapshot = await this.snapshot(args.matchId, live.pliesPlayed);
    this.deps.publish?.(args.matchId, "prediction.market", snapshot);
    return { account: await this.getAccount(args.wallet), snapshot };
  }

  /** Public market view. `pliesPlayed` defaults to the indexed position. */
  async snapshot(matchId: string, pliesPlayed?: number): Promise<MarketSnapshot> {
    const matchRows = await sql`
      SELECT game_status,
             (SELECT COALESCE(MAX(move_number), 0) FROM moves WHERE match_id = ${matchId}) AS ply
      FROM matches WHERE match_id = ${matchId}
    `;
    const played = pliesPlayed ?? Number(matchRows[0]?.ply ?? 0);
    const open = matchRows[0]?.gameStatus === "Active";

    const optionRows = await sql`
      SELECT ply, predicted_san, SUM(stake)::bigint AS stake, COUNT(*)::int AS bettors,
             BOOL_OR(status = 'open') AS has_open
      FROM move_bets
      WHERE match_id = ${matchId} AND ply > ${Math.max(0, played - 6)}
      GROUP BY ply, predicted_san
    `;
    const settledRows = await sql`
      SELECT ply, status, actual_san FROM move_markets
      WHERE match_id = ${matchId} AND ply > ${Math.max(0, played - 6)}
    `;
    const settled = new Map(
      settledRows.map((row) => [Number(row.ply), row])
    );

    const byPly = new Map<number, PlyMarket>();
    const ensure = (ply: number): PlyMarket => {
      let market = byPly.get(ply);
      if (!market) {
        const result = settled.get(ply);
        market = {
          ply,
          status: result ? (String(result.status) as PlyMarket["status"]) : "open",
          pool: 0,
          bettors: 0,
          options: [],
          actualSan: result?.actualSan ? String(result.actualSan) : null,
        };
        byPly.set(ply, market);
      }
      return market;
    };
    for (const row of optionRows) {
      const market = ensure(Number(row.ply));
      const stake = Number(row.stake);
      market.pool += stake;
      market.bettors += Number(row.bettors);
      market.options.push({ san: String(row.predictedSan), stake, bettors: Number(row.bettors) });
    }
    for (const ply of settled.keys()) ensure(ply);
    if (open) {
      for (let ply = played + 1; ply <= played + 3; ply += 1) ensure(ply);
    }
    const markets = [...byPly.values()]
      .map((market) => ({
        ...market,
        options: market.options.sort((a, b) => b.stake - a.stake).slice(0, 12),
      }))
      .sort((a, b) => a.ply - b.ply);

    return {
      matchId,
      pliesPlayed: played,
      nextPly: played + 1,
      maxPly: played + this.config.maxPliesAhead,
      open,
      markets,
    };
  }

  /** Ingest hook: a verified move was indexed. */
  async onMoveIndexed(args: { matchId: string }) {
    await this.settleReady(args.matchId);
  }

  /** Ingest hook: void markets beyond the last move once the game is over. */
  async onGameEnded(args: { matchId: string; finalPly: number }) {
    await this.settleReady(args.matchId);
    const voided = await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const bets = await tx`
        UPDATE move_bets
        SET status = 'refunded', payout = stake, settled_at = NOW()
        WHERE match_id = ${args.matchId} AND ply > ${args.finalPly} AND status = 'open'
        RETURNING wallet, stake, ply
      `;
      for (const bet of bets) {
        await tx`
          UPDATE prediction_accounts
          SET balance = balance + ${Number(bet.stake)},
              total_staked = total_staked - ${Number(bet.stake)},
              updated_at = NOW()
          WHERE wallet = ${String(bet.wallet)}
        `;
      }
      const plies = [...new Set(bets.map((bet) => Number(bet.ply)))];
      for (const ply of plies) {
        await tx`
          INSERT INTO move_markets (match_id, ply, status, settled_at)
          VALUES (${args.matchId}, ${ply}, 'void', NOW())
          ON CONFLICT (match_id, ply) DO NOTHING
        `;
      }
      return bets.length;
    });
    if (voided > 0 || this.deps.publish) {
      this.deps.publish?.(args.matchId, "prediction.market", await this.snapshot(args.matchId));
    }
  }

  /**
   * Settle every ply with open bets whose move (and the position before it)
   * is indexed. Safe to call repeatedly; settlement is per-ply atomic.
   */
  async settleReady(matchId: string): Promise<number> {
    const plies = await sql`
      SELECT DISTINCT b.ply, m.algebraic_move, m.confirmed_at,
             COALESCE(prev.fen_after_move, CASE WHEN b.ply = 1 THEN ${INITIAL_FEN} END) AS fen_before
      FROM move_bets b
      JOIN moves m ON m.match_id = b.match_id AND m.move_number = b.ply
      LEFT JOIN moves prev ON prev.match_id = b.match_id AND prev.move_number = b.ply - 1
      WHERE b.match_id = ${matchId} AND b.status = 'open'
    `;
    let settledCount = 0;
    for (const row of plies) {
      const ply = Number(row.ply);
      if (row.fenBefore == null) continue; // Previous move not indexed yet.
      const actualSan = sanFromUci(String(row.fenBefore), String(row.algebraicMove));
      const settled = await this.settlePly(
        matchId,
        ply,
        actualSan,
        String(row.algebraicMove),
        row.confirmedAt == null ? null : new Date(row.confirmedAt as string).getTime()
      );
      if (settled) {
        settledCount += 1;
        this.deps.publish?.(matchId, "prediction.settled", settled);
      }
    }
    if (settledCount > 0) {
      this.deps.publish?.(matchId, "prediction.market", await this.snapshot(matchId));
    }
    return settledCount;
  }

  private async settlePly(
    matchId: string,
    ply: number,
    actualSan: string | null,
    actualUci: string,
    confirmedAtMs: number | null
  ) {
    return sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const rows = await tx`
        SELECT id, wallet, predicted_san, stake, created_at
        FROM move_bets
        WHERE match_id = ${matchId} AND ply = ${ply} AND status = 'open'
        FOR UPDATE
      `;
      if (rows.length === 0) return null;
      const bets: BetForSettlement[] = rows.map((row) => ({
        id: Number(row.id),
        wallet: String(row.wallet),
        predictedSan: String(row.predictedSan),
        stake: Number(row.stake),
        createdAtMs: new Date(row.createdAt as string).getTime(),
      }));
      // If the SAN can't be reconstructed, refund rather than guess.
      const outcomes = actualSan
        ? settleBets(bets, actualSan, confirmedAtMs)
        : bets.map((bet) => ({
            id: bet.id,
            wallet: bet.wallet,
            stake: bet.stake,
            status: "refunded" as const,
            payout: bet.stake,
          }));

      for (const outcome of outcomes) {
        await tx`
          UPDATE move_bets
          SET status = ${outcome.status}, payout = ${outcome.payout}, settled_at = NOW()
          WHERE id = ${outcome.id}
        `;
        const won = outcome.status === "won" ? 1 : 0;
        const lost = outcome.status === "lost" ? 1 : 0;
        const refunded = outcome.status === "refunded" ? outcome.stake : 0;
        await tx`
          UPDATE prediction_accounts
          SET balance = balance + ${outcome.payout},
              total_staked = total_staked - ${refunded},
              total_won = total_won + ${outcome.status === "won" ? outcome.payout : 0},
              bets_won = bets_won + ${won},
              bets_lost = bets_lost + ${lost},
              updated_at = NOW()
          WHERE wallet = ${outcome.wallet}
        `;
      }
      await tx`
        INSERT INTO move_markets (match_id, ply, status, actual_uci, actual_san, settled_at)
        VALUES (${matchId}, ${ply}, 'settled', ${actualUci}, ${actualSan}, NOW())
        ON CONFLICT (match_id, ply) DO UPDATE
          SET status = 'settled', actual_uci = EXCLUDED.actual_uci,
              actual_san = EXCLUDED.actual_san, settled_at = NOW()
      `;
      return {
        ply,
        actualSan,
        winners: outcomes.filter((o) => o.status === "won").map((o) => ({ wallet: o.wallet, payout: o.payout })),
        losers: outcomes.filter((o) => o.status === "lost").length,
        refunded: outcomes.filter((o) => o.status === "refunded").length,
      };
    });
  }

  /** Background safety net: settle anything a missed hook left open. */
  async sweep(): Promise<void> {
    const rows = await sql`
      SELECT DISTINCT b.match_id
      FROM move_bets b
      JOIN moves m ON m.match_id = b.match_id AND m.move_number = b.ply
      WHERE b.status = 'open'
      LIMIT 200
    `;
    for (const row of rows) await this.settleReady(String(row.matchId));

    const ended = await sql`
      SELECT DISTINCT b.match_id,
             (SELECT COALESCE(MAX(move_number), 0) FROM moves WHERE match_id = b.match_id) AS ply
      FROM move_bets b JOIN matches m ON m.match_id = b.match_id
      WHERE b.status = 'open'
        AND m.game_status IN ('WhiteWins', 'BlackWins', 'Draw', 'Aborted')
      LIMIT 200
    `;
    for (const row of ended) {
      await this.onGameEnded({ matchId: String(row.matchId), finalPly: Number(row.ply) });
    }
  }

  async leaderboard(limit = 20) {
    const rows = await sql`
      SELECT wallet, balance, total_won, bets_won, bets_lost
      FROM prediction_accounts
      WHERE bets_won + bets_lost > 0
      ORDER BY balance DESC, bets_won DESC
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
    `;
    return rows.map((row, index) => ({
      rank: index + 1,
      wallet: String(row.wallet),
      balance: Number(row.balance),
      totalWon: Number(row.totalWon),
      betsWon: Number(row.betsWon),
      betsLost: Number(row.betsLost),
    }));
  }
}

function plyOfFen(fen: string): number | null {
  const fields = fen.trim().split(/\s+/);
  const fullmove = Number(fields[5]);
  if (!Number.isInteger(fullmove) || (fields[1] !== "w" && fields[1] !== "b")) return null;
  return (fullmove - 1) * 2 + (fields[1] === "b" ? 1 : 0);
}

function toAccount(row: Record<string, unknown> | undefined): PredictionAccount {
  if (!row) throw new PredictionError("Prediction account unavailable.", 500, "account");
  return {
    wallet: String(row.wallet),
    balance: Number(row.balance),
    totalStaked: Number(row.totalStaked),
    totalWon: Number(row.totalWon),
    betsWon: Number(row.betsWon),
    betsLost: Number(row.betsLost),
  };
}
