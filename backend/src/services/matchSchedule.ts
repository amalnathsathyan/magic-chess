/**
 * The start time a match id carries. Mirrors `sdk/src/utils/matchId.ts`
 * (the backend doesn't depend on the SDK package).
 *
 *   mc-<16 hex>              start now (open from creation)
 *   mc-<16 hex>-t<base36>    start at <base36> minutes since the Unix epoch
 *   mc-<20 hex>              older ids, start now
 */

const APP_MATCH_ID = /^mc-([0-9a-f]{16,20})(?:-t([0-9a-z]{1,8}))?$/;

/** How long an open match accepts a joiner after its start time, in seconds. */
export const OPEN_MATCH_WINDOW_SECONDS = 60 * 60;

export type MatchStartPhase = "upcoming" | "open" | "expired";

export interface MatchStartState {
  /** ISO time the match starts: the scheduled time, or its creation time. */
  startsAt: string;
  /** ISO time after which the app no longer offers to join. */
  openUntil: string;
  /** True when the id carries an explicit start time. */
  scheduled: boolean;
  /** Only set while the match is waiting for an opponent. */
  startPhase: MatchStartPhase | null;
}

/** Unix seconds written into the id, or null for "start now" and foreign ids. */
export function scheduledStartAt(matchId: string): number | null {
  const minutes = APP_MATCH_ID.exec(matchId)?.[2];
  if (!minutes) return null;
  const value = parseInt(minutes, 36);
  return Number.isSafeInteger(value) ? value * 60 : null;
}

/**
 * Start-time fields for an API match row. `createdAt` is the row's
 * `created_at` (the account's creation time).
 */
export function startState(
  row: { matchId: unknown; gameStatus: unknown; createdAt: unknown },
  nowMs: number = Date.now()
): MatchStartState {
  const matchId = String(row.matchId ?? "");
  const scheduled = scheduledStartAt(matchId);
  const createdMs = toMillis(row.createdAt);
  const startMs = scheduled !== null ? scheduled * 1000 : createdMs;
  const openUntilMs = startMs + OPEN_MATCH_WINDOW_SECONDS * 1000;
  const waiting = row.gameStatus === "WaitingForOpponent";
  return {
    startsAt: new Date(startMs).toISOString(),
    openUntil: new Date(openUntilMs).toISOString(),
    scheduled: scheduled !== null,
    startPhase: !waiting
      ? null
      : nowMs < startMs
        ? "upcoming"
        : nowMs <= openUntilMs
          ? "open"
          : "expired",
  };
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
