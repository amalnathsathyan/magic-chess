import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { expectedScore, kFactor, rateGame, whiteScoreFor } from "../src/services/rating.js";
import { normalizeProfileEdit, profileUpdateMessage } from "../src/services/profiles.js";

test("equal players swing by half the K-factor", () => {
  const fresh = { rating: 1200, games: 0 };
  assert.deepEqual(rateGame(fresh, fresh, 1), { white: 20, black: -20 });
  assert.deepEqual(rateGame(fresh, fresh, 0.5), { white: 0, black: 0 });
});

test("upsets move more than expected results", () => {
  const strong = { rating: 1600, games: 50 };
  const weak = { rating: 1200, games: 50 };
  const expected = rateGame(strong, weak, 1);
  const upset = rateGame(strong, weak, 0);
  assert.ok(Math.abs(upset.white) > Math.abs(expected.white));
  assert.ok(expectedScore(1600, 1200) > 0.9);
});

test("provisional players use a larger K-factor", () => {
  assert.equal(kFactor(0), 40);
  assert.equal(kFactor(29), 40);
  assert.equal(kFactor(30), 20);
});

test("terminal statuses map to White's score", () => {
  assert.equal(whiteScoreFor("WhiteWins"), 1);
  assert.equal(whiteScoreFor("blackWins"), 0);
  assert.equal(whiteScoreFor("Draw"), 0.5);
  assert.equal(whiteScoreFor("Aborted"), null);
});

test("profile edits are trimmed and validated", () => {
  assert.deepEqual(normalizeProfileEdit({ displayName: "  magnus_c ", bio: " hi \n there ", avatar: "" }), {
    displayName: "magnus_c",
    bio: "hi there",
    avatar: null,
  });
  assert.throws(() => normalizeProfileEdit({ displayName: "a b" }), /Display names/);
  assert.throws(() => normalizeProfileEdit({ displayName: "ab" }), /Display names/);
  assert.throws(() => normalizeProfileEdit({ bio: "x".repeat(161) }), /Bios/);
  assert.throws(() => normalizeProfileEdit({ avatar: "dragon" }), /avatar/);
});

test("the signed profile message binds every field", () => {
  const edit = { displayName: "neo", bio: null, avatar: "knight" as const };
  const message = profileUpdateMessage("Wallet111", edit, 42);
  assert.match(message, /name:neo/);
  assert.match(message, /avatar:knight/);
  assert.notEqual(message, profileUpdateMessage("Wallet111", { ...edit, displayName: "trinity" }, 42));
});
