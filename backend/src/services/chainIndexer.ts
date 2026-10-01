import type { Connection, PublicKey } from "@solana/web3.js";
import { sql } from "../db/pool.js";
import {
  baseConnection,
  DELEGATION_PROGRAM_ID,
  erConnection,
  getDelegationStatus,
  indexedProgramEvents,
  matchPda,
  programId,
} from "./transactionVerifier.js";
import type { IngestInput, IngestResult } from "./eventIngest.js";

/**
 * Backend-owned indexer: reads Magic Chess events straight from the chain so
 * the lobby, live arena, stats and move markets never depend on a player's
 * browser reporting each transaction.
 *
 * - Program scan (base layer): match creation, joins, aborts, settlements,
 *   and any undelegated moves.
 * - Match scan: every live match's PDA on its authoritative runtime (the
 *   MagicBlock ER while delegated), fast enough to lock move markets within
 *   a few seconds of a confirmed move.
 *
 * Every event goes through `ingest`, which is idempotent, so overlapping
 * scans and browser hints are harmless.
 */

export interface ChainIndexerOptions {
  ingest: (input: IngestInput) => Promise<IngestResult>;
  onApplied?: (matchId: string, result: Extract<IngestResult, { status: "applied" }>) => Promise<void>;
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  matchIntervalMs?: number;
  programIntervalMs?: number;
  signatureLimit?: number;
}

const MAX_SEEN = 20_000;
const MAX_DEFERRED_ATTEMPTS = 20;

interface RuntimeCache {
  connection: Connection;
  resolvedAt: number;
}

export class ChainIndexer {
  private readonly seen = new Map<string, true>();
  private readonly deferredAttempts = new Map<string, number>();
  private readonly runtimes = new Map<string, RuntimeCache>();
  private readonly lastBaseScan = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  private programScanRunning = false;
  private matchScanRunning = false;

  constructor(private readonly options: ChainIndexerOptions) {}

  start(): void {
    const program = setInterval(
      () => void this.guard("program", () => this.scanProgram()),
      this.options.programIntervalMs ?? 15_000
    );
    const matches = setInterval(
      () => void this.guard("matches", () => this.scanTrackedMatches()),
      this.options.matchIntervalMs ?? 3_000
    );
    program.unref();
    matches.unref();
    this.timers.push(program, matches);
    void this.guard("program", () => this.scanProgram());
  }

  close(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** Index a single match right away (e.g. when someone opens it). */
  async scanMatchNow(matchId: string): Promise<void> {
    await this.scanMatch(matchId);
  }

  private async guard(kind: "program" | "matches", run: () => Promise<void>): Promise<void> {
    const flag = kind === "program" ? "programScanRunning" : "matchScanRunning";
    if (this[flag]) return;
    this[flag] = true;
    try {
      await run();
    } catch (error) {
      this.options.log.warn({ error: String(error), kind }, "Chain indexer scan failed");
    } finally {
      this[flag] = false;
    }
  }

  private async scanProgram(): Promise<void> {
    await this.scanAddress(baseConnection, programId);
  }

  private async scanTrackedMatches(): Promise<void> {
    const rows = await sql`
      SELECT match_id FROM matches
      WHERE (
        game_status IN ('WaitingForOpponent', 'Active')
        AND last_move_at > NOW() - INTERVAL '1 day'
      ) OR (
        game_status IN ('WhiteWins', 'BlackWins', 'Draw')
        AND payout_processed = FALSE
        AND ended_at > NOW() - INTERVAL '6 hours'
      )
      ORDER BY last_move_at DESC
      LIMIT 100
    `;
    for (const row of rows) {
      await this.scanMatch(String(row.matchId)).catch((error) =>
        this.options.log.warn({ error: String(error), matchId: row.matchId }, "Match scan failed")
      );
    }
  }

  private async scanMatch(matchId: string): Promise<void> {
    const pda = matchPda(matchId);
    const er = await this.runtimeFor(matchId, pda);
    if (er) await this.scanAddress(er, pda);

    // The base layer changes rarely during ER play; scan it less often.
    const now = Date.now();
    if (!er || now - (this.lastBaseScan.get(matchId) ?? 0) > 15_000) {
      this.lastBaseScan.set(matchId, now);
      await this.scanAddress(baseConnection, pda);
    }
  }

  /** The match's ER connection while delegated, else null (base only). */
  private async runtimeFor(matchId: string, pda: PublicKey): Promise<Connection | null> {
    const cached = this.runtimes.get(matchId);
    if (cached && Date.now() - cached.resolvedAt < 30_000) return cached.connection;
    const info = await baseConnection.getAccountInfo(pda, "confirmed");
    if (!info?.owner.equals(DELEGATION_PROGRAM_ID)) {
      this.runtimes.delete(matchId);
      return null;
    }
    const status = await getDelegationStatus(pda);
    if (!status.isDelegated || !status.fqdn) return null;
    const connection = erConnection(status.fqdn);
    this.runtimes.set(matchId, { connection, resolvedAt: Date.now() });
    return connection;
  }

  private async scanAddress(connection: Connection, address: PublicKey): Promise<void> {
    const signatures = await connection.getSignaturesForAddress(
      address,
      { limit: this.options.signatureLimit ?? 50 },
      "confirmed"
    );
    // Oldest first, so joins land before moves and moves before results.
    for (const info of [...signatures].reverse()) {
      if (info.err || this.seen.has(info.signature)) continue;
      const done = await this.processSignature(connection, info.signature);
      if (done) this.markSeen(info.signature);
    }
  }

  /** Returns true when the signature needs no further attention. */
  private async processSignature(connection: Connection, signature: string): Promise<boolean> {
    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) return false; // Not visible yet on this RPC; retry.
    if (transaction.meta?.err) return true;

    let pending = false;
    for (const { event, eventIndex } of indexedProgramEvents(
      transaction.meta?.logMessages ?? []
    )) {
      const result = await this.options.ingest({
        event,
        signature,
        slot: transaction.slot,
        eventIndex,
        blockTime: transaction.blockTime ?? null,
      });
      if (result.status === "applied") {
        await this.options.onApplied?.(event.matchId, result);
      } else if (result.status === "deferred") {
        pending = true;
      }
    }

    if (!pending) {
      this.deferredAttempts.delete(signature);
      return true;
    }
    // Give prerequisites (e.g. the creation tx) time to be indexed, but don't
    // re-fetch a permanently orphaned transaction forever.
    const attempts = (this.deferredAttempts.get(signature) ?? 0) + 1;
    this.deferredAttempts.set(signature, attempts);
    if (attempts >= MAX_DEFERRED_ATTEMPTS) {
      this.deferredAttempts.delete(signature);
      this.options.log.warn({ signature }, "Giving up on deferred chain events");
      return true;
    }
    return false;
  }

  private markSeen(signature: string): void {
    this.seen.set(signature, true);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.keys().next().value;
      if (oldest) this.seen.delete(oldest);
    }
  }
}
