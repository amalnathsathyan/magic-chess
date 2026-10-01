import { verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

export interface PrivyAccessClaims {
  userId: string;
  sessionId: string;
  appId: string;
}

/** Privy publishes each app's token-signing keys here. */
export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`;
}

// One cached key set per URL; jose refreshes it when Privy rotates keys.
const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(url: string): JWTVerifyGetKey {
  let keySet = jwksCache.get(url);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, keySet);
  }
  return keySet;
}

/**
 * Verify a Privy access token with Privy's official server SDK.
 *
 * Uses a pasted PEM verification key when one is configured, otherwise the
 * app's JWKS endpoint (no key to copy, and rotation is handled).
 */
export async function verifyPrivyAccessToken(
  token: string,
  appId: string,
  options: { verificationKey?: string; jwksUrl?: string } = {}
): Promise<PrivyAccessClaims> {
  if (!appId) {
    throw new Error("Privy backend authentication is not configured");
  }

  const claims = await verifyAccessToken({
    access_token: token,
    app_id: appId,
    verification_key:
      options.verificationKey || jwksFor(options.jwksUrl || privyJwksUrl(appId)),
  });

  return {
    userId: claims.user_id,
    sessionId: claims.session_id,
    appId: claims.app_id,
  };
}
