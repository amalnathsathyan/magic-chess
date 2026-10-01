import assert from "node:assert/strict";
import test from "node:test";
import { SponsorBudget } from "../src/services/sponsorBudget.js";

test("limits requests per user per minute, independent of wallet", () => {
  let now = 0;
  const budget = new SponsorBudget(
    { requestsPerMinute: 2, costlyPerHour: 5, hourlyBudgetLamports: 10n ** 9n },
    () => now
  );
  budget.checkRequest("user-a");
  budget.checkRequest("user-a");
  assert.throws(() => budget.checkRequest("user-a"), /rate limit/);
  budget.checkRequest("user-b");
  now += 60_000;
  assert.doesNotThrow(() => budget.checkRequest("user-a"));
});

test("caps costly operations per user per hour", () => {
  let now = 0;
  const budget = new SponsorBudget(
    { requestsPerMinute: 100, costlyPerHour: 1, hourlyBudgetLamports: 10n ** 9n },
    () => now
  );
  budget.reserve("user-a", 1n, true);
  assert.throws(() => budget.reserve("user-a", 1n, true), /too many/);
  assert.doesNotThrow(() => budget.reserve("user-a", 1n, false));
  now += 60 * 60_000;
  assert.doesNotThrow(() => budget.reserve("user-a", 1n, true));
});

test("enforces the global hourly lamport budget across users", () => {
  let now = 0;
  const budget = new SponsorBudget(
    { requestsPerMinute: 100, costlyPerHour: 100, hourlyBudgetLamports: 100n },
    () => now
  );
  budget.reserve("a", 60n, false);
  assert.throws(() => budget.reserve("b", 50n, false), /busy/);
  now += 60 * 60_000;
  assert.doesNotThrow(() => budget.reserve("b", 50n, false));
});
