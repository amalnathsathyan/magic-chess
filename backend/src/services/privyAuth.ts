import {
  createRemoteJWKSet,
  customFetch,
  decodeJwt,
  decodeProtectedHeader,
  errors,
  importSPKI,
  jwtVerify,
  type CryptoKey,
  type FetchImplementation,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
} from "jose";

// Privy access tokens: ES256 JWTs issued by privy.io for one app (`aud`).
const PRIVY_ISSUER = "privy.io";
const PRIVY_ALGORITHM = "ES256";

export interface PrivyAccessClaims {
  userId: string;
  sessionId: string;
  appId: string;
}

/**
 * A rejected Privy access token, with a reason precise enough to act on.
 * - `token`: the token itself is wrong (expired, malformed, another app's).
 * - `key`: the token's signature doesn't match the key we checked it with.
 * - `config`: the key couldn't be loaded at all, so signing in again won't help.
 */
export class PrivyAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "token" | "key" | "config" = "token"
  ) {
    super(message);
    this.name = "PrivyAuthError";
  }
}

/** Privy publishes each app's token-signing keys here. */
export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`;
}

// jose only reports "Expected 200 OK"; keep the status so it can be shown.
const fetchJwks: FetchImplementation = async (url, init) => {
  const response = await fetch(url, init);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response;
};

// One cached key set per URL; jose refreshes it when Privy rotates keys.
const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(url: string): JWTVerifyGetKey {
  let keySet = jwksCache.get(url);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(url), {
      timeoutDuration: 10_000,
      [customFetch]: fetchJwks,
    });
    jwksCache.set(url, keySet);
  }
  return keySet;
}

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${error.message}: ${detail}` : error.message;
}

/** Turn a jose failure while checking against `source` into a fixable reason. */
function explain(error: unknown, source: string, kid?: string): PrivyAuthError {
  if (error instanceof PrivyAuthError) return error;
  if (error instanceof errors.JWTExpired) {
    return new PrivyAuthError("the sign-in token has expired");
  }
  if (error instanceof errors.JWTClaimValidationFailed) {
    return new PrivyAuthError(
      `the sign-in token's "${error.claim}" claim failed (${error.reason})`
    );
  }
  if (error instanceof errors.JWTInvalid || error instanceof errors.JWSInvalid) {
    return new PrivyAuthError(`the sign-in token is malformed (${error.message})`);
  }
  if (error instanceof errors.JOSEAlgNotAllowed) {
    return new PrivyAuthError(`the sign-in token isn't signed with ${PRIVY_ALGORITHM}`);
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) {
    return new PrivyAuthError(`its signature doesn't match ${source}`, "key");
  }
  if (error instanceof errors.JWKSNoMatchingKey) {
    return new PrivyAuthError(
      `${source} has no key ${kid ? `"${kid}" ` : ""}for this token`,
      "key"
    );
  }
  if (error instanceof errors.JWKSTimeout) {
    return new PrivyAuthError(`timed out loading ${source}`, "config");
  }
  return new PrivyAuthError(`couldn't load ${source} (${describeFailure(error)})`, "config");
}

/**
 * Verify a Privy access token: ES256, issued by privy.io, for `appId`.
 *
 * Uses a pasted PEM verification key when one is configured, falling back to
 * the app's JWKS endpoint (no key to copy, and rotation is handled). Every
 * rejection says why, e.g. a token minted for a different Privy app.
 */
export async function verifyPrivyAccessToken(
  token: string,
  appId: string,
  options: { verificationKey?: string; jwksUrl?: string } = {}
): Promise<PrivyAccessClaims> {
  if (!appId) {
    throw new PrivyAuthError("Privy backend authentication is not configured", "config");
  }

  // Read the unverified header and claims first, so a frontend/backend app
  // mismatch is named instead of surfacing as a bare signature failure.
  // Nothing here is trusted: jwtVerify below re-checks all of it.
  let kid: string | undefined;
  let unverified: JWTPayload;
  try {
    kid = decodeProtectedHeader(token).kid;
    unverified = decodeJwt(token);
  } catch {
    throw new PrivyAuthError("the sign-in token isn't a Privy access token (not a JWT)");
  }
  if (unverified.iss !== PRIVY_ISSUER) {
    throw new PrivyAuthError(
      `the sign-in token was issued by ${JSON.stringify(unverified.iss ?? null)}, not ${PRIVY_ISSUER}`
    );
  }
  const audiences = [unverified.aud ?? []].flat();
  if (!audiences.includes(appId)) {
    throw new PrivyAuthError(
      `the sign-in token is for Privy app ${audiences.join(", ") || "(none)"}, ` +
        `but this backend's PRIVY_APP_ID is ${appId}`
    );
  }

  const verifyOptions: JWTVerifyOptions = {
    typ: "JWT",
    algorithms: [PRIVY_ALGORITHM],
    issuer: PRIVY_ISSUER,
    audience: appId,
  };
  const verifyWith = async (key: CryptoKey | JWTVerifyGetKey, source: string) => {
    try {
      const { payload } =
        typeof key === "function"
          ? await jwtVerify(token, key, verifyOptions)
          : await jwtVerify(token, key, verifyOptions);
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
        throw new PrivyAuthError("the sign-in token is missing its user or session");
      }
      return { userId: payload.sub, sessionId: payload.sid, appId };
    } catch (error) {
      throw explain(error, source, kid);
    }
  };

  const jwksUrl = options.jwksUrl || privyJwksUrl(appId);
  const viaJwks = async () => {
    let keySet: JWTVerifyGetKey;
    try {
      keySet = jwksFor(jwksUrl);
    } catch {
      throw new PrivyAuthError(`PRIVY_JWKS_URL isn't a valid URL (${jwksUrl})`, "config");
    }
    return verifyWith(keySet, `Privy's signing keys at ${jwksUrl}`);
  };
  if (!options.verificationKey) return viaJwks();

  let pemError: PrivyAuthError;
  try {
    const key = await importSPKI(options.verificationKey, PRIVY_ALGORITHM).catch((error) => {
      throw new PrivyAuthError(
        `PRIVY_JWT_VERIFICATION_KEY isn't a valid ES256 public key (${describeFailure(error)})`,
        "config"
      );
    });
    return await verifyWith(key, "PRIVY_JWT_VERIFICATION_KEY");
  } catch (error) {
    pemError = explain(error, "PRIVY_JWT_VERIFICATION_KEY", kid);
  }
  // The key matched but the token itself is bad; the JWKS would say the same.
  if (pemError.kind === "token") throw pemError;

  // A pasted PEM key goes stale when Privy rotates keys; the JWKS endpoint is
  // always current, so give it a chance before rejecting.
  try {
    return await viaJwks();
  } catch (error) {
    const jwksError = explain(error, `Privy's signing keys at ${jwksUrl}`, kid);
    if (jwksError.kind === "token") throw jwksError;
    throw new PrivyAuthError(
      `${pemError.message}, and ${jwksError.message}`,
      pemError.kind === "config" && jwksError.kind === "config" ? "config" : "key"
    );
  }
}
