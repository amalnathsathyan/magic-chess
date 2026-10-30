import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_MATCH_WINDOW_SECONDS,
  scheduledStartAt,
  startState,
} from "../src/services/matchSchedule.js";

const CREATED = new Date("2026-11-01T18:00:00Z");
const START = new Date("2026-11-01T19:00:00Z");
const startMinutes = Math.floor(START.getTime() / 60_000).toString(36);
const scheduledId = `mc-0123456789abcdef-t${startMinutes}`;

test("scheduledStartAt decodes the id suffix and ignores the rest", () => {
  assert.equal(scheduledStartAt(scheduledId), START.getTime() / 1000);
  assert.equal(scheduledStartAt("mc-0123456789abcdef"), null);
  assert.equal(scheduledStartAt("mc-0123456789abcdef0123"), null);
  assert.equal(scheduledStartAt("something-else"), null);
});

test("an immediate match is open from creation for the join window", () => {
  const row = { matchId: "mc-0123456789abcdef0123", gameStatus: "WaitingForOpponent", createdAt: CREATED };
  const state = startState(row, CREATED.getTime() + 60_000);
  assert.equal(state.startsAt, CREATED.toISOString());
  assert.equal(state.scheduled, false);
  assert.equal(state.startPhase, "open");
  assert.equal(
    startState(row, CREATED.getTime() + (OPEN_MATCH_WINDOW_SECONDS + 1) * 1000).startPhase,
    "expired"
  );
});

test("a scheduled match is upcoming, then open, then expired", () => {
  const row = { matchId: scheduledId, gameStatus: "WaitingForOpponent", createdAt: CREATED };
  assert.equal(startState(row, CREATED.getTime()).startPhase, "upcoming");
  assert.equal(startState(row, START.getTime()).startPhase, "open");
  assert.equal(startState(row, START.getTime()).startsAt, START.toISOString());
  assert.equal(startState(row, START.getTime()).scheduled, true);
  assert.equal(
    startState(row, START.getTime() + (OPEN_MATCH_WINDOW_SECONDS + 1) * 1000).startPhase,
    "expired"
  );
});

test("a joined game has no start phase", () => {
  const row = { matchId: scheduledId, gameStatus: "Active", createdAt: CREATED };
  assert.equal(startState(row).startPhase, null);
});
