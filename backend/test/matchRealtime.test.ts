import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMatchClock,
  MatchRealtimeHub,
  type MatchRealtimeSnapshot,
  type RealtimeEvent,
} from "../src/services/matchRealtime.js";

const NOW = Date.parse("2026-08-09T10:00:30.000Z");

function snapshot(
  overrides: Partial<MatchRealtimeSnapshot> = {}
): MatchRealtimeSnapshot {
  return {
    matchId: "mc-realtime",
    whitePlayer: "white-wallet",
    blackPlayer: "black-wallet",
    gameStatus: "Active",
    gameEndReason: null,
    bettingTokenMint: "mint",
    betAmountPerPlayer: "1000000",
    totalPot: "2000000",
    moveTimeoutSeconds: "60",
    currentFen:
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    currentTurn: "black",
    createdAt: "2026-08-09T09:59:00.000Z",
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: null,
    lastMoveAt: "2026-08-09T10:00:00.000Z",
    payoutProcessed: false,
    moveCount: 1,
    ...overrides,
  };
}

test("calculates one shared authoritative move deadline", () => {
  assert.deepEqual(calculateMatchClock(snapshot(), NOW), {
    serverTime: "2026-08-09T10:00:30.000Z",
    activeColor: "black",
    deadlineAt: "2026-08-09T10:01:00.000Z",
    remainingMs: 30_000,
    expired: false,
    authority: "confirmed-chain-index",
  });
  assert.equal(calculateMatchClock(snapshot(), NOW + 31_000).expired, true);
  assert.equal(
    calculateMatchClock(snapshot({ gameStatus: "WhiteWins" }), NOW).remainingMs,
    null
  );
});

test("does not overflow JavaScript dates for extreme on-chain timeouts", () => {
  assert.deepEqual(
    calculateMatchClock(snapshot({ moveTimeoutSeconds: "9223372036854775807" }), NOW),
    {
      serverTime: "2026-08-09T10:00:30.000Z",
      activeColor: "black",
      deadlineAt: null,
      remainingMs: null,
      expired: false,
      authority: "confirmed-chain-index",
    }
  );
});

test("bounds process-local realtime sessions", () => {
  const state = snapshot();
  const hub = new MatchRealtimeHub(async () => state, {
    now: () => NOW,
    maxSessions: 1,
  });
  hub.createSession({ snapshot: state });
  assert.throws(() => hub.createSession({ snapshot: state }), {
    name: "RealtimeCapacityError",
  });
});

test("replaces a matching client session instead of consuming capacity", () => {
  const state = snapshot();
  const hub = new MatchRealtimeHub(async () => state, {
    now: () => NOW,
    maxSessions: 1,
  });
  const first = hub.createSession({ snapshot: state, clientId: "same-client" });
  const second = hub.createSession({ snapshot: state, clientId: "same-client" });
  assert.notEqual(first.token, second.token);
  assert.equal(hub.hasSession(state.matchId, first.token), false);
  assert.equal(hub.hasSession(state.matchId, second.token), true);
});

test("closes a superseded connection using the same session token", () => {
  const state = snapshot();
  const hub = new MatchRealtimeHub(async () => state, { now: () => NOW });
  const session = hub.createSession({ snapshot: state });
  let closes = 0;
  assert.ok(
    hub.subscribe({
      matchId: state.matchId,
      token: session.token,
      send: () => undefined,
      close: () => {
        closes += 1;
      },
    })
  );
  assert.ok(
    hub.subscribe({
      matchId: state.matchId,
      token: session.token,
      send: () => undefined,
    })
  );
  assert.equal(closes, 1);
  hub.close();
});

test("fans notifications and synchronized presence to both players and spectators", () => {
  const state = snapshot();
  const hub = new MatchRealtimeHub(async () => state, { now: () => NOW });
  const white = hub.createSession({ snapshot: state, wallet: state.whitePlayer });
  const black = hub.createSession({ snapshot: state, wallet: state.blackPlayer });
  const watcher = hub.createSession({ snapshot: state });
  const whiteEvents: RealtimeEvent[] = [];
  const blackEvents: RealtimeEvent[] = [];
  const watcherEvents: RealtimeEvent[] = [];

  const whiteConnection = hub.subscribe({
    matchId: state.matchId,
    token: white.token,
    send: (event) => whiteEvents.push(event),
  });
  const blackConnection = hub.subscribe({
    matchId: state.matchId,
    token: black.token,
    send: (event) => blackEvents.push(event),
  });
  const watcherConnection = hub.subscribe({
    matchId: state.matchId,
    token: watcher.token,
    send: (event) => watcherEvents.push(event),
  });

  assert.ok(whiteConnection && blackConnection && watcherConnection);
  const presence = whiteEvents
    .filter((event) => event.event === "presence.sync")
    .at(-1)?.data as {
    white: { online: boolean };
    black: { online: boolean };
    spectators: number;
  };
  assert.deepEqual(presence, {
    cause: "presence.joined",
    role: "spectator",
    white: { online: true },
    black: { online: true },
    spectators: 1,
    connections: 3,
    serverTime: "2026-08-09T10:00:30.000Z",
  });

  hub.publish(state.matchId, "match.notification", {
    type: "player-joined",
  });
  for (const events of [whiteEvents, blackEvents, watcherEvents]) {
    assert.equal(events.at(-1)?.event, "match.notification");
    assert.deepEqual(events.at(-1)?.data, { type: "player-joined" });
  }

  whiteConnection.disconnect();
  blackConnection.disconnect();
  watcherConnection.disconnect();
});

test("replays missed events and requires a snapshot after buffer expiry", () => {
  const state = snapshot();
  const hub = new MatchRealtimeHub(async () => state, {
    now: () => NOW,
    eventBufferSize: 2,
  });
  const session = hub.createSession({ snapshot: state });
  const firstConnection = hub.subscribe({
    matchId: state.matchId,
    token: session.token,
    send: () => undefined,
  });
  assert.ok(firstConnection);

  const one = hub.publish(state.matchId, "move", { move: 1 });
  const two = hub.publish(state.matchId, "move", { move: 2 });
  firstConnection.disconnect();

  const replayed: RealtimeEvent[] = [];
  const secondConnection = hub.subscribe({
    matchId: state.matchId,
    token: session.token,
    lastEventId: one.id,
    send: (event) => replayed.push(event),
  });
  assert.ok(secondConnection);
  assert.ok(replayed.some((event) => event.id === two.id));
  secondConnection.disconnect();

  hub.publish(state.matchId, "move", { move: 3 });
  hub.publish(state.matchId, "move", { move: 4 });
  const expired: RealtimeEvent[] = [];
  const thirdConnection = hub.subscribe({
    matchId: state.matchId,
    token: session.token,
    lastEventId: one.id,
    send: (event) => expired.push(event),
  });
  assert.ok(thirdConnection);
  assert.ok(
    expired.some(
      (event) =>
        event.event === "resync.required" &&
        (event.data as { reason: string }).reason === "event-buffer-expired"
    )
  );
  assert.ok(expired.some((event) => event.event === "match.snapshot"));
  thirdConnection.disconnect();
});

test("refresh publishes a transaction notification and changed chain snapshot", async () => {
  const initial = snapshot({ blackPlayer: null, gameStatus: "WaitingForOpponent" });
  const joined = snapshot();
  let current = initial;
  const hub = new MatchRealtimeHub(async () => current, { now: () => NOW });
  const session = hub.createSession({ snapshot: initial, wallet: initial.whitePlayer });
  const events: RealtimeEvent[] = [];
  const connection = hub.subscribe({
    matchId: initial.matchId,
    token: session.token,
    send: (event) => events.push(event),
  });
  assert.ok(connection);

  current = joined;
  await hub.refresh(initial.matchId, {
    type: "player-joined",
    blackPlayer: joined.blackPlayer,
  });

  assert.equal(events.at(-2)?.event, "match.notification");
  assert.equal(events.at(-1)?.event, "match.snapshot");
  assert.equal(
    (events.at(-1)?.data as MatchRealtimeSnapshot).blackPlayer,
    "black-wallet"
  );
  connection.disconnect();
});
