import assert from "node:assert/strict";
import test from "node:test";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { corsOptions } from "../src/cors.js";

const ORIGIN = "https://arena.chessmagic.workers.dev";

test("the browser preflight allows every method the API routes use", async () => {
  const app = Fastify();
  await app.register(cors, corsOptions([ORIGIN]));
  app.put("/api/players/:pubkey/profile", async () => ({ ok: true }));
  await app.ready();

  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/players/x/profile",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": method,
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], ORIGIN);
    assert.match(String(response.headers["access-control-allow-methods"]), new RegExp(`\\b${method}\\b`));
  }
  await app.close();
});
