/**
 * In-memory spend limits for the sponsor relay.
 *
 * - `requestsPerMinute` per Privy user (not per wallet: one user can sign with
 *   any number of throwaway keys).
 * - `costlyPerHour` per Privy user for rent-heavy operations (match and
 *   session creation).
 * - `hourlyBudgetLamports` across all users: a circuit breaker that bounds the
 *   worst case if many accounts are farmed.
 *
 * Single-process by design (the backend runs as one Render instance). Entries
 * are swept so attacker-chosen keys cannot grow memory without bound.
 */
export class SponsorBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorBudgetError";
  }
}

interface Window {
  start: number;
  count: number;
}

export interface SponsorBudgetOptions {
  requestsPerMinute: number;
  costlyPerHour: number;
  hourlyBudgetLamports: bigint;
  maxTrackedUsers?: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export class SponsorBudget {
  private readonly requests = new Map<string, Window>();
  private readonly costly = new Map<string, Window>();
  private spend: { start: number; lamports: bigint } = { start: 0, lamports: 0n };

  constructor(
    private readonly options: SponsorBudgetOptions,
    private readonly now: () => number = Date.now
  ) {}

  /** Count a request; throws when the per-minute limit is exceeded. */
  checkRequest(userId: string): void {
    if (!this.bump(this.requests, userId, MINUTE, this.options.requestsPerMinute)) {
      throw new SponsorBudgetError("Sponsor rate limit exceeded");
    }
  }

  /**
   * Reserve budget for a validated transaction before relaying it. Costly
   * operations count against the per-user hourly cap.
   */
  reserve(userId: string, costLamports: bigint, isCostly: boolean): void {
    const now = this.now();
    if (now - this.spend.start >= HOUR) this.spend = { start: now, lamports: 0n };
    if (this.spend.lamports + costLamports > this.options.hourlyBudgetLamports) {
      throw new SponsorBudgetError(
        "Gas sponsorship is busy right now. Try again later or use a funded wallet."
      );
    }
    if (isCostly && !this.bump(this.costly, userId, HOUR, this.options.costlyPerHour)) {
      throw new SponsorBudgetError(
        "You've created too many sponsored matches or sessions this hour."
      );
    }
    this.spend.lamports += costLamports;
  }

  /** Drop expired windows; called periodically. */
  sweep(): void {
    const now = this.now();
    for (const [map, span] of [
      [this.requests, MINUTE],
      [this.costly, HOUR],
    ] as const) {
      for (const [key, window] of map) {
        if (now - window.start >= span) map.delete(key);
      }
      const max = this.options.maxTrackedUsers ?? 10_000;
      if (map.size > max) map.clear();
    }
  }

  private bump(map: Map<string, Window>, key: string, span: number, limit: number): boolean {
    const now = this.now();
    const current = map.get(key);
    if (!current || now - current.start >= span) {
      map.set(key, { start: now, count: 1 });
      return limit >= 1;
    }
    current.count += 1;
    return current.count <= limit;
  }
}
