/**
 * Active games whose side to move ran out of time. On-chain, such a game stays
 * Active until the waiting player sends `claim_timeout_win`, so without this
 * the lobby keeps listing it as live for days.
 */

/**
 * Extra time before the backend calls a game timed out. `last_move_at` can lag
 * the chain by up to one reconciler sweep (60s), so a move that isn't indexed
 * yet must not make a running game look abandoned.
 */
export const TIMEOUT_GRACE_SECONDS = 120;

export type Side = "white" | "black";

export interface TimeoutState {
  /** The side to move is out of time; the game waits for the other side to claim. */
  timedOut: boolean;
  /** The side that ran out of time. */
  timedOutSide: Side | null;
  /** When the side to move runs out of time (no grace), or null when untimed. */
  timeoutAt: string | null;
}

export function sideToMove(fen: string | null | undefined, plies?: number | null): Side | null {
  const turn = fen?.split(" ")[1];
  if (turn === "w") return "white";
  if (turn === "b") return "black";
  if (plies !== null && plies !== undefined && Number.isFinite(plies)) {
    return plies % 2 === 0 ? "white" : "black";
  }
  return null;
}

export function timeoutState(
  match: {
    gameStatus: unknown;
    lastMoveAt: unknown;
    moveTimeoutSeconds: unknown;
    fen?: string | null;
    plies?: number | null;
  },
  now = Date.now()
): TimeoutState {
  const none: TimeoutState = { timedOut: false, timedOutSide: null, timeoutAt: null };
  if (match.gameStatus !== "Active") return none;
  const timeout = Number(match.moveTimeoutSeconds);
  const lastMove =
    match.lastMoveAt instanceof Date ? match.lastMoveAt.getTime() : Date.parse(String(match.lastMoveAt));
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(lastMove)) return none;

  const deadline = lastMove + timeout * 1_000;
  const timedOut = now > deadline + TIMEOUT_GRACE_SECONDS * 1_000;
  return {
    timedOut,
    timedOutSide: timedOut ? sideToMove(match.fen, match.plies) : null,
    timeoutAt: new Date(deadline).toISOString(),
  };
}

/** The same rule as `timeoutState().timedOut`, as a SQL condition on `matches`. */
export const TIMED_OUT_SQL = `(game_status = 'Active' AND move_timeout_seconds > 0
  AND last_move_at + make_interval(secs => (move_timeout_seconds + ${TIMEOUT_GRACE_SECONDS})::double precision) < NOW())`;
