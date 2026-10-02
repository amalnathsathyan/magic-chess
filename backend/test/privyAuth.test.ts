import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { exportJWK, exportSPKI, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import {
  PrivyAuthError,
  privyJwksUrl,
  verifyPrivyAccessToken,
} from "../src/services/privyAuth.js";

const APP_ID = "cmsdk4zc7003y0cjlc22j9igy";
const OTHER_APP_ID = "cmth9quz203wq0di2z03h8b63";

/** Rejects with a PrivyAuthError of `kind` whose message matches `reason`. */
async function rejectsWith(
  promise: Promise<unknown>,
  kind: PrivyAuthError["kind"],
  reason: RegExp
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PrivyAuthError, `expected PrivyAuthError, got ${error}`);
    assert.equal(error.kind, kind, error.message);
    assert.match(error.message, reason);
    return true;
  });
}

test("builds the Privy JWKS URL for an app", () => {
  assert.equal(
    privyJwksUrl(APP_ID),
    "https://auth.privy.io/api/v1/apps/cmsdk4zc7003y0cjlc22j9igy/jwks.json"
  );
});

test("verifies Privy access tokens and names the cause of every rejection", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const server = createServer((req, res) => {
    if (req.url !== "/jwks.json") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const jwksUrl = `${base}/jwks.json`;

  const sign = ({
    audience = APP_ID,
    issuer = "privy.io",
    key = privateKey,
    kid = "k1",
    expires = "1h",
  }: {
    audience?: string;
    issuer?: string;
    key?: CryptoKey;
    kid?: string;
    expires?: string | number;
  } = {}) =>
    new SignJWT({ sid: "session-1" })
      .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("did:privy:user-1")
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(key);

  const other = await generateKeyPair("ES256");
  const stalePem = await exportSPKI(other.publicKey);

  try {
    const claims = await verifyPrivyAccessToken(await sign(), APP_ID, { jwksUrl });
    assert.deepEqual(claims, {
      userId: "did:privy:user-1",
      sessionId: "session-1",
      appId: APP_ID,
    });

    // Frontend and backend configured for different Privy apps.
    await rejectsWith(
      verifyPrivyAccessToken(await sign({ audience: OTHER_APP_ID }), APP_ID, { jwksUrl }),
      "token",
      new RegExp(`is for Privy app ${OTHER_APP_ID}, but this backend's PRIVY_APP_ID is ${APP_ID}`)
    );
    await rejectsWith(
      verifyPrivyAccessToken(await sign({ issuer: "evil.example" }), APP_ID, { jwksUrl }),
      "token",
      /issued by "evil.example", not privy\.io/
    );
    await rejectsWith(
      verifyPrivyAccessToken("not-a-jwt", APP_ID, { jwksUrl }),
      "token",
      /isn't a Privy access token/
    );
    await rejectsWith(
      verifyPrivyAccessToken(
        await sign({ expires: Math.floor(Date.now() / 1000) - 60 }),
        APP_ID,
        { jwksUrl }
      ),
      "token",
      /has expired/
    );

    // Signed by a key that isn't in the app's JWKS.
    await rejectsWith(
      verifyPrivyAccessToken(await sign({ key: other.privateKey }), APP_ID, { jwksUrl }),
      "key",
      /signature doesn't match Privy's signing keys at http/
    );
    await rejectsWith(
      verifyPrivyAccessToken(await sign({ kid: "k9" }), APP_ID, { jwksUrl }),
      "key",
      /has no key "k9" for this token/
    );

    // The backend can't load the key set at all.
    await rejectsWith(
      verifyPrivyAccessToken(await sign(), APP_ID, { jwksUrl: `${base}/missing.json` }),
      "config",
      /couldn't load Privy's signing keys at .*\(HTTP 404/
    );

    // A stale pasted PEM key (Privy rotated keys) falls back to the JWKS.
    const fallback = await verifyPrivyAccessToken(await sign(), APP_ID, {
      verificationKey: stalePem,
      jwksUrl,
    });
    assert.equal(fallback.userId, "did:privy:user-1");
    // So does a PEM key that was pasted wrong.
    const garbled = await verifyPrivyAccessToken(await sign(), APP_ID, {
      verificationKey: "-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----",
      jwksUrl,
    });
    assert.equal(garbled.userId, "did:privy:user-1");
    // ...but a token neither key accepts is still rejected, naming both.
    const stranger = await generateKeyPair("ES256");
    await rejectsWith(
      verifyPrivyAccessToken(await sign({ key: stranger.privateKey }), APP_ID, {
        verificationKey: stalePem,
        jwksUrl,
      }),
      "key",
      /doesn't match PRIVY_JWT_VERIFICATION_KEY, and its signature doesn't match Privy's signing keys/
    );
    // A matching PEM key with an expired token doesn't retry the JWKS.
    await rejectsWith(
      verifyPrivyAccessToken(
        await sign({ expires: Math.floor(Date.now() / 1000) - 60 }),
        APP_ID,
        { verificationKey: await exportSPKI(publicKey), jwksUrl: `${base}/missing.json` }
      ),
      "token",
      /has expired/
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  // Nothing listening: the backend's network, not the player's token.
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const closedPort = (closed.address() as AddressInfo).port;
  await new Promise((resolve) => closed.close(resolve));
  await rejectsWith(
    verifyPrivyAccessToken(await sign(), APP_ID, {
      jwksUrl: `http://127.0.0.1:${closedPort}/jwks.json`,
    }),
    "config",
    /couldn't load Privy's signing keys at .*\(fetch failed: ECONNREFUSED\)/
  );
});
