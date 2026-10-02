import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { exportJWK, exportSPKI, generateKeyPair, SignJWT } from "jose";
import { privyJwksUrl, verifyPrivyAccessToken } from "../src/services/privyAuth.js";

const APP_ID = "cmsdk4zc7003y0cjlc22j9igy";

test("builds the Privy JWKS URL for an app", () => {
  assert.equal(
    privyJwksUrl(APP_ID),
    "https://auth.privy.io/api/v1/apps/cmsdk4zc7003y0cjlc22j9igy/jwks.json"
  );
});

test("verifies Privy access tokens against a JWKS endpoint", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`;

  const sign = (audience: string, key = privateKey) =>
    new SignJWT({ sid: "session-1" })
      .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
      .setIssuer("privy.io")
      .setAudience(audience)
      .setSubject("did:privy:user-1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

  try {
    const claims = await verifyPrivyAccessToken(await sign(APP_ID), APP_ID, { jwksUrl });
    assert.deepEqual(claims, {
      userId: "did:privy:user-1",
      sessionId: "session-1",
      appId: APP_ID,
    });

    // Token minted for another Privy app (the frontend/backend mismatch case).
    await assert.rejects(
      verifyPrivyAccessToken(await sign("cmth9quz203wq0di2z03h8b63"), APP_ID, { jwksUrl })
    );
    // Token signed by a key that isn't in the app's JWKS.
    const other = await generateKeyPair("ES256");
    await assert.rejects(
      verifyPrivyAccessToken(await sign(APP_ID, other.privateKey), APP_ID, { jwksUrl })
    );

    // A stale pasted PEM key (Privy rotated keys) falls back to the JWKS.
    const stalePem = await exportSPKI(other.publicKey);
    const fallback = await verifyPrivyAccessToken(await sign(APP_ID), APP_ID, {
      verificationKey: stalePem,
      jwksUrl,
    });
    assert.equal(fallback.userId, "did:privy:user-1");
    // ...but a token neither key accepts is still rejected.
    const stranger = await generateKeyPair("ES256");
    await assert.rejects(
      verifyPrivyAccessToken(await sign(APP_ID, stranger.privateKey), APP_ID, {
        verificationKey: stalePem,
        jwksUrl,
      })
    );
  } finally {
    server.close();
  }
});
