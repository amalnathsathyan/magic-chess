/**
 * Match ids and the start time they carry.
 *
 * The on-chain program has no notion of a start time: `join_match` is allowed
 * as soon as the match exists. ZUG Arena schedules matches without a program
 * change by writing the planned start into the match id itself, which every
 * reader (lobby, play page, backend, bots) gets straight from the chain:
 *
 *   mc-<16 hex>              start now (the match is open from creation)
 *   mc-<16 hex>-t<base36>    start at <base36> minutes since the Unix epoch
 *
 * Ids created before scheduling existed are `mc-<20 hex>` and mean "start now".
 * The app enforces the schedule in the UI; the chain itself does not, so a
 * raw SDK caller can still join early. That becomes a program check when the
 * match account next changes layout (see CLAUDE.md).
 */

const APP_MATCH_ID = /^mc-([0-9a-f]{16,20})(?:-t([0-9a-z]{1,8}))?$/;

/** How long an open match accepts a joiner after its start time, in seconds. */
export const OPEN_MATCH_WINDOW_SECONDS = 60 * 60;

/** A scheduled start can be at most this far ahead, in seconds. */
export const MAX_SCHEDULE_AHEAD_SECONDS = 30 * 24 * 60 * 60;

export type MatchStartPhase = "upcoming" | "open" | "expired";

export interface MatchStartState {
  /** Unix seconds the match starts: the scheduled time, or its creation time. */
  startsAt: number;
  /** Unix seconds after which the app no longer offers to join. */
  openUntil: number;
  /** True when the id carries an explicit start time. */
  scheduled: boolean;
  phase: MatchStartPhase;
}

/** True for ids ZUG Arena creates, scheduled or not. */
export function isAppMatchId(matchId: string): boolean {
  return APP_MATCH_ID.test(matchId);
}

/**
 * The start time written into a match id, in Unix seconds, or null when the
 * id has none (start now) or isn't an app id.
 */
export function scheduledStartAt(matchId: string): number | null {
  const parsed = APP_MATCH_ID.exec(matchId);
  const minutes = parsed?.[2];
  if (!minutes) return null;
  const value = parseInt(minutes, 36);
  return Number.isSafeInteger(value) ? value * 60 : null;
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A new match id, carrying `startsAt` (Unix seconds or a Date) when the match
 * should start later than now. The start is kept to the minute.
 */
export function buildMatchId(options: { startsAt?: number | Date | null } = {}): string {
  const id = `mc-${randomHex(8)}`;
  const raw = options.startsAt;
  if (raw === undefined || raw === null) return id;
  const seconds = raw instanceof Date ? Math.floor(raw.getTime() / 1000) : Math.floor(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("startsAt must be a Unix timestamp in seconds or a Date");
  }
  return `${id}-t${Math.floor(seconds / 60).toString(36)}`;
}

/**
 * Where an open match is in its life: not yet joinable, joinable, or past
 * the join window. `createdAt` is the account's `last_move_timestamp`, which
 * the program sets at creation and only moves again when someone joins.
 */
export function matchStartState(
  matchId: string,
  createdAt: number | bigint,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): MatchStartState {
  const scheduled = scheduledStartAt(matchId);
  const startsAt = scheduled ?? Number(createdAt);
  const openUntil = startsAt + OPEN_MATCH_WINDOW_SECONDS;
  const phase: MatchStartPhase =
    nowSeconds < startsAt ? "upcoming" : nowSeconds <= openUntil ? "open" : "expired";
  return { startsAt, openUntil, scheduled: scheduled !== null, phase };
}
