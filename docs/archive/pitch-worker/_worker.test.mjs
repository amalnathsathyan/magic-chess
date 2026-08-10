import assert from "node:assert/strict";
import test from "node:test";

import worker from "./_worker.mjs";

function request(path = "/", init) {
  return worker.fetch(new Request(`https://pitch.example${path}`, init));
}

test("serves the current devnet proof page", async () => {
  const response = await request();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(html, /arena-dev\.chessmagic\.workers\.dev/);
  assert.match(html, /SessionTokenV2/);
  assert.doesNotMatch(html, /ADD (COUNTRY|PUBLIC VIDEO)/);
});

test("supports HEAD without returning a body", async () => {
  const response = await request("/", { method: "HEAD" });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("exposes an uncached health endpoint", async () => {
  const response = await request("/health");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("rejects unsupported methods", async () => {
  const response = await request("/", { method: "POST" });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("returns 404 for unknown paths", async () => {
  const response = await request("/missing");

  assert.equal(response.status, 404);
});
