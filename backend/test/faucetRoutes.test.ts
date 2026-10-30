import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { faucetRoutes, setFaucetServiceForTests } from "../src/routes/faucet.js";
import type { FaucetService } from "../src/services/faucet.js";

test("status says the faucet is off when it isn't configured", async () => {
  setFaucetServiceForTests(null);
  const app = Fastify();
  faucetRoutes(app);
  const response = await app.inject({ method: "GET", url: "/api/faucet/status" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { enabled: false });
  const claim = await app.inject({
    method: "POST",
    url: "/api/faucet/claim",
    payload: { walletAddress: "BuMLxTELQyTyNxroqFGHJprL1sdVMyQJ7om3MQUGToPQ" },
  });
  assert.equal(claim.statusCode, 404);
  await app.close();
});

test("status is public; a wallet's claim state needs a Privy token", async () => {
  const fake = {
    publicStatus: async () => ({
      enabled: true,
      mint: "ZUGmint",
      symbol: "ZUG",
      decimals: 6,
      signupAmount: 10_000,
      dailyAmount: 1_000,
      treasuryRemaining: "999990000",
    }),
  } as unknown as FaucetService;
  setFaucetServiceForTests(fake);
  const app = Fastify();
  faucetRoutes(app);
  try {
    const anonymous = await app.inject({ method: "GET", url: "/api/faucet/status" });
    assert.equal(anonymous.statusCode, 200);
    assert.equal(anonymous.json().signupAmount, 10_000);
    assert.equal(anonymous.json().wallet, undefined);

    const badToken = await app.inject({
      method: "GET",
      url: "/api/faucet/status?wallet=BuMLxTELQyTyNxroqFGHJprL1sdVMyQJ7om3MQUGToPQ",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    assert.ok([401, 503].includes(badToken.statusCode), `got ${badToken.statusCode}`);

    const claim = await app.inject({
      method: "POST",
      url: "/api/faucet/claim",
      payload: { walletAddress: "BuMLxTELQyTyNxroqFGHJprL1sdVMyQJ7om3MQUGToPQ" },
    });
    assert.equal(claim.statusCode, 401);
    assert.equal(claim.json().code, "unauthorized");

    const badWallet = await app.inject({
      method: "POST",
      url: "/api/faucet/claim",
      payload: { walletAddress: "not-a-wallet" },
    });
    assert.equal(badWallet.statusCode, 400);
  } finally {
    setFaucetServiceForTests(undefined);
    await app.close();
  }
});
