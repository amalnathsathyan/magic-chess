import assert from "node:assert/strict";
import test from "node:test";
import { TIMEOUT_GRACE_SECONDS, sideToMove, timeoutState } from "../src/services/matchTimeout.js";

const now = Date.parse("2026-10-10T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1_000);
const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

test("an active game is timed out only after its move clock and the grace period", () => {
  const game = { gameStatus: "Active", moveTimeoutSeconds: "180", fen: BLACK_TO_MOVE };
  const running = timeoutState({ ...game, lastMoveAt: ago(60) }, now);
  assert.equal(running.timedOut, false);
  assert.equal(running.timeoutAt, ago(60 - 180).toISOString());

  // Out of time, but inside the grace period an unindexed move may still exist.
  assert.equal(timeoutState({ ...game, lastMoveAt: ago(180 + TIMEOUT_GRACE_SECONDS - 1) }, now).timedOut, false);

  const stale = timeoutState({ ...game, lastMoveAt: ago(3 * 24 * 3600) }, now);
  assert.deepEqual(
    { timedOut: stale.timedOut, timedOutSide: stale.timedOutSide },
    { timedOut: true, timedOutSide: "black" }
  );
});

test("finished, waiting and untimed games never time out", () => {
  const old = ago(3 * 24 * 3600);
  for (const gameStatus of ["WhiteWins", "BlackWins", "Draw", "WaitingForOpponent", "Aborted"]) {
    assert.equal(timeoutState({ gameStatus, lastMoveAt: old, moveTimeoutSeconds: 60 }, now).timedOut, false);
  }
  const untimed = timeoutState({ gameStatus: "Active", lastMoveAt: old, moveTimeoutSeconds: 0 }, now);
  assert.deepEqual(untimed, { timedOut: false, timedOutSide: null, timeoutAt: null });
});

test("the side to move comes from the FEN, else from the ply count", () => {
  assert.equal(sideToMove(BLACK_TO_MOVE), "black");
  assert.equal(sideToMove(null, 0), "white");
  assert.equal(sideToMove(null, 37), "black");
  assert.equal(sideToMove(null), null);
});
