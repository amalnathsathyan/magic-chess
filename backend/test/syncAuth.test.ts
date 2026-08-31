import assert from "node:assert/strict";
import test from "node:test";
import { syncAuthMode } from "../src/services/syncAuth.js";

test("allows browser sync without exposing the indexer secret", () => {
  assert.equal(syncAuthMode(undefined, "trusted-indexer-secret"), "public");
});

test("recognizes the trusted indexer key", () => {
  assert.equal(
    syncAuthMode("trusted-indexer-secret", "trusted-indexer-secret"),
    "trusted"
  );
});

test("rejects supplied invalid keys without timingSafeEqual length errors", () => {
  assert.equal(syncAuthMode("wrong", "trusted-indexer-secret"), "invalid");
  assert.equal(syncAuthMode("trusted-indexer-secreu", "trusted-indexer-secret"), "invalid");
});
