import bs58 from "bs58";
import type { Connection } from "@solana/web3.js";
import type { Sql } from "postgres";
import { config } from "../config.js";
import { sql } from "../db/pool.js";
import { updatePlayerStats } from "./eventIngest.js";
import { decodeMatchAccount, type MatchAccount } from "./matchState.js";
import {
  baseConnection,
  DELEGATION_PROGRAM_ID,
  erConnection,
  getDelegationStatus,
  matchPda,
  programId,
} from "./transactionVerifier.js";

/**
 * Rebuilds the index from on-chain match accounts.
 *
 * The chain indexer follows transaction logs, which only works while the
 * backend is running and the database is reachable: a sleeping server or a
 * database outage loses those events, and rollup transaction history doesn't
 * last forever. Match accounts do. This sweep reads every match account
 * (on the base layer, and on the rollup for delegated ones) and brings each
 * row up to date: creation, join, result, final position and payout. Results
 * go through the same rating and XP path as events, guarded by the match
 * status, so a result is never counted twice whichever path sees it first.
 *
 * Moves themselves are only in transaction logs; for games whose moves are
 * missing, `onDiscovered` lets the chain indexer try to fetch them.
 */

const CHESS_MATCH_DISCRIMINATOR = bs58.encode(
  Buffer.from([72, 241, 122, 67, 252, 229, 79, 237])
);

const STATUS_TO_DB: Record<MatchAccount["gameStatus"], string> = {
  waitingForOpponent: "WaitingForOpponent",
  active: "Active",
  whiteWins: "WhiteWins",
  blackWins: "BlackWins",
  draw: "Draw",
  aborted: "Aborted",
};

const TERMINAL = new Set(["WhiteWins", "BlackWins", "Draw"]);

/** How many delegated matches to read from the rollup per sweep. */
const MAX_ROLLUP_READS = 40;

export interface ReconcileStats {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  accountsSeen: number;
  rowsChanged: number;
}

export type ReconcileChange =
  | "inserted"
  | "joined"
  | "ended"
  | "aborted"
  | "position"
  | "payout"
  | "unchanged";

export interface MatchReconcilerOptions {
  intervalMs?: number;
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  /** Called for every row the sweep changed. */
  onChanged?: (matchId: string, change: ReconcileChange) => Promise<void>;
  /** Called once per process for games that have fewer stored moves than plies. */
  onMissingMoves?: (matchId: string) => Promise<void>;
}

export class MatchReconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly movesRequested = new Set<string>();
  private readonly status: ReconcileStats = {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    accountsSeen: 0,
    rowsChanged: 0,
  };

  constructor(private readonly options: MatchReconcilerOptions) {}

  start(): void {
    const tick = () => void this.runOnce();
    this.timer = setInterval(tick, this.options.intervalMs ?? 60_000);
    this.timer.unref();
    tick();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stats(): ReconcileStats {
    return { ...this.status };
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.status.lastRunAt = new Date().toISOString();
    try {
      const accounts = await this.loadAccounts();
      let changed = 0;
      for (const account of accounts) {
        try {
          const change = await reconcileMatch(account);
          if (change !== "unchanged") {
            changed += 1;
            await this.options.onChanged?.(account.matchId, change);
          }
          await this.requestMissingMoves(account);
        } catch (error) {
          this.options.log.warn(
            { error: String(error), matchId: account.matchId },
            "Match reconcile failed"
          );
        }
      }
      this.status.accountsSeen = accounts.length;
      this.status.rowsChanged += changed;
      this.status.lastSuccessAt = new Date().toISOString();
      this.status.lastError = null;
      if (changed > 0) {
        this.options.log.info({ accounts: accounts.length, changed }, "Reconciled match accounts");
      }
    } catch (error) {
      this.status.lastError = String(error);
      this.options.log.warn({ error: String(error) }, "Match reconcile sweep failed");
    } finally {
      this.running = false;
    }
  }

  private async loadAccounts(): Promise<MatchAccount[]> {
    const filters = [{ memcmp: { offset: 0, bytes: CHESS_MATCH_DISCRIMINATOR } }];
    const owned = await baseConnection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters,
    });
    const accounts = new Map<string, MatchAccount>();
    for (const { account } of owned) {
      const decoded = safeDecode(account.data);
      if (decoded) accounts.set(decoded.matchId, decoded);
    }

    // Delegated matches are owned by the delegation program on the base
    // layer, and their base copy is a snapshot: read the rollup for the
    // live state, falling back to the snapshot.
    let delegated: Awaited<ReturnType<Connection["getProgramAccounts"]>> = [];
    try {
      delegated = await baseConnection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        commitment: "confirmed",
        filters,
      });
    } catch (error) {
      this.options.log.warn({ error: String(error) }, "Could not list delegated matches");
    }
    const snapshots = delegated
      .map(({ account }) => safeDecode(account.data))
      .filter((decoded): decoded is MatchAccount => decoded !== null)
      .sort((a, b) => b.lastMoveTimestamp - a.lastMoveTimestamp);

    const known = await sql`
      SELECT match_id, game_status FROM matches
      WHERE match_id IN ${sql(snapshots.map((s) => s.matchId).concat("-"))}
    `;
    const settled = new Set(
      known
        .filter((row) => TERMINAL.has(String(row.gameStatus)) || row.gameStatus === "Aborted")
        .map((row) => String(row.matchId))
    );

    let rollupReads = 0;
    for (const snapshot of snapshots) {
      let live: MatchAccount | null = null;
      if (!settled.has(snapshot.matchId) && rollupReads < MAX_ROLLUP_READS) {
        rollupReads += 1;
        live = await readFromRollup(snapshot.matchId).catch(() => null);
      }
      accounts.set(snapshot.matchId, live ?? snapshot);
    }
    return [...accounts.values()];
  }

  private async requestMissingMoves(account: MatchAccount): Promise<void> {
    if (!this.options.onMissingMoves || account.pliesPlayed === 0) return;
    if (this.movesRequested.has(account.matchId)) return;
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM moves WHERE match_id = ${account.matchId}
    `;
    if (Number(rows[0]?.n ?? 0) >= account.pliesPlayed) return;
    this.movesRequested.add(account.matchId);
    await this.options.onMissingMoves(account.matchId).catch(() => undefined);
  }
}

function safeDecode(data: Buffer): MatchAccount | null {
  try {
    return decodeMatchAccount(data);
  } catch {
    return null;
  }
}

async function readFromRollup(matchId: string): Promise<MatchAccount | null> {
  const pda = matchPda(matchId);
  const status = await getDelegationStatus(pda);
  if (!status.isDelegated || !status.fqdn) return null;
  const info = await erConnection(status.fqdn).getAccountInfo(pda, "confirmed");
  if (!info?.owner.equals(programId)) return null;
  return decodeMatchAccount(info.data);
}

/**
 * Bring one match row in line with its on-chain account. Exported for tests.
 */
export async function reconcileMatch(account: MatchAccount): Promise<ReconcileChange> {
  return sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as Sql;
    const chainStatus = STATUS_TO_DB[account.gameStatus];
    const at = new Date(
      (account.lastMoveTimestamp > 0 ? account.lastMoveTimestamp : Date.now() / 1000) * 1000
    );

    const existing = await tx`
      SELECT match_id, game_status, black_player, ply_count, payout_processed,
             (SELECT COUNT(*)::int FROM moves WHERE match_id = m.match_id) AS stored_moves
      FROM matches m WHERE match_id = ${account.matchId}
      FOR UPDATE
    `;

    let change: ReconcileChange = "unchanged";
    if (existing.length === 0) {
      // Insert as it was before any result, then apply the result below so
      // ratings and XP go through the one shared path.
      const startStatus =
        account.black && chainStatus !== "WaitingForOpponent" ? "Active" : "WaitingForOpponent";
      const wager = account.wager;
      await tx`
        INSERT INTO matches (
          match_id, white_player, black_player, game_status,
          betting_token_mint, bet_amount_per_player, total_pot, platform_fee_bps,
          move_timeout_seconds, created_at, started_at, last_move_at,
          current_fen, ply_count, index_source, reconciled_at
        ) VALUES (
          ${account.matchId}, ${account.white},
          ${startStatus === "Active" ? account.black : null}, ${startStatus},
          ${wager?.mint ?? config.solana.wagerMint}, ${wager?.betPerPlayer ?? "0"},
          ${wager?.totalPot ?? "0"}, ${wager?.feeBps ?? 0},
          ${account.moveTimeoutSeconds}, ${at},
          ${startStatus === "Active" ? at : null}, ${at},
          ${account.fen}, ${account.pliesPlayed}, 'account', NOW()
        )
      `;
      change = "inserted";
    } else {
      const row = existing[0];
      if (row.gameStatus === "WaitingForOpponent" && account.black && chainStatus !== "WaitingForOpponent" && chainStatus !== "Aborted") {
        await tx`
          UPDATE matches
          SET black_player = ${account.black},
              game_status = 'Active',
              total_pot = bet_amount_per_player * 2,
              started_at = COALESCE(started_at, ${at}),
              reconciled_at = NOW()
          WHERE match_id = ${account.matchId}
        `;
        change = "joined";
      }
      // Moves missing from the log: keep the final position from the account.
      const storedPlies = Math.max(Number(row.plyCount ?? 0), Number(row.storedMoves ?? 0));
      if (account.pliesPlayed > storedPlies) {
        await tx`
          UPDATE matches
          SET current_fen = ${account.fen},
              ply_count = ${account.pliesPlayed},
              last_move_at = GREATEST(last_move_at, ${at}),
              reconciled_at = NOW()
          WHERE match_id = ${account.matchId}
        `;
        if (change === "unchanged") change = "position";
      }
    }

    if (TERMINAL.has(chainStatus)) {
      const ended = await tx`
        UPDATE matches
        SET game_status = ${chainStatus},
            game_end_reason = ${account.endReason},
            ended_at = COALESCE(ended_at, ${at}),
            reconciled_at = NOW()
        WHERE match_id = ${account.matchId} AND game_status = 'Active'
        RETURNING match_id
      `;
      if (ended.length) {
        await updatePlayerStats(tx, account.matchId, chainStatus, reasonKey(account.endReason));
        change = "ended";
      }
    } else if (chainStatus === "Aborted") {
      const aborted = await tx`
        UPDATE matches
        SET game_status = 'Aborted', game_end_reason = 'Aborted',
            payout_processed = TRUE, ended_at = COALESCE(ended_at, ${at}),
            reconciled_at = NOW()
        WHERE match_id = ${account.matchId} AND game_status = 'WaitingForOpponent'
        RETURNING match_id
      `;
      if (aborted.length) change = "aborted";
    }

    if (account.wager?.payoutProcessed && TERMINAL.has(chainStatus)) {
      const paid = await tx`
        UPDATE matches SET payout_processed = TRUE, reconciled_at = NOW()
        WHERE match_id = ${account.matchId} AND payout_processed = FALSE
        RETURNING match_id
      `;
      if (paid.length && change === "unchanged") change = "payout";
    }
    return change;
  });
}

/** Event-style reason key that `updatePlayerStats` expects. */
function reasonKey(reason: MatchAccount["endReason"]): string {
  if (!reason) return "checkmate";
  return reason.charAt(0).toLowerCase() + reason.slice(1);
}
