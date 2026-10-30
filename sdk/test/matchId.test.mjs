import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/utils/matchId.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const {
  OPEN_MATCH_WINDOW_SECONDS,
  buildMatchId,
  isAppMatchId,
  matchStartState,
  scheduledStartAt,
} = await import(moduleUrl);

test("legacy and new ids are app ids; others are not", () => {
  assert.equal(isAppMatchId("mc-0123456789abcdef0123"), true);
  assert.equal(isAppMatchId("mc-0123456789abcdef"), true);
  assert.equal(isAppMatchId("mc-0123456789abcdef-thu6ka0"), true);
  assert.equal(isAppMatchId("mc-0123456789abcdef-t"), false);
  assert.equal(isAppMatchId("mc-ABCDEF0123456789"), false);
  assert.equal(isAppMatchId("bot-match-1"), false);
});

test("an immediate id carries no start time", () => {
  const id = buildMatchId();
  assert.match(id, /^mc-[0-9a-f]{16}$/);
  assert.equal(scheduledStartAt(id), null);
  assert.equal(scheduledStartAt("mc-0123456789abcdef0123"), null);
});

test("a scheduled id round-trips its start to the minute", () => {
  const startsAt = 1_800_000_123; // not on a minute boundary
  const id = buildMatchId({ startsAt });
  assert.match(id, /^mc-[0-9a-f]{16}-t[0-9a-z]{1,8}$/);
  assert.ok(id.length <= 32, "match ids must fit the program's 32-byte limit");
  assert.equal(scheduledStartAt(id), 1_800_000_120);
  assert.equal(scheduledStartAt(buildMatchId({ startsAt: new Date(startsAt * 1000) })), 1_800_000_120);
});

test("buildMatchId rejects a bad start", () => {
  assert.throws(() => buildMatchId({ startsAt: Number.NaN }));
  assert.throws(() => buildMatchId({ startsAt: -5 }));
});

test("start state follows the clock", () => {
  const createdAt = 1_800_000_000;
  const immediate = buildMatchId();
  assert.deepEqual(matchStartState(immediate, createdAt, createdAt + 10), {
    startsAt: createdAt,
    openUntil: createdAt + OPEN_MATCH_WINDOW_SECONDS,
    scheduled: false,
    phase: "open",
  });
  assert.equal(matchStartState(immediate, BigInt(createdAt), createdAt + OPEN_MATCH_WINDOW_SECONDS + 1).phase, "expired");

  const startsAt = createdAt + 600;
  const scheduled = buildMatchId({ startsAt });
  assert.equal(matchStartState(scheduled, createdAt, createdAt + 10).phase, "upcoming");
  assert.equal(matchStartState(scheduled, createdAt, startsAt).phase, "open");
  assert.equal(matchStartState(scheduled, createdAt, startsAt).scheduled, true);
  assert.equal(matchStartState(scheduled, createdAt, startsAt + OPEN_MATCH_WINDOW_SECONDS + 60).phase, "expired");
});
