import { verifyAccessToken } from "@privy-io/node";

export interface PrivyAccessClaims {
  userId: string;
  sessionId: string;
  appId: string;
}

/** Verify a Privy access token with Privy's official server SDK. */
export async function verifyPrivyAccessToken(
  token: string,
  appId: string,
  verificationKey: string
): Promise<PrivyAccessClaims> {
  if (!appId || !verificationKey) {
    throw new Error("Privy backend authentication is not configured");
  }

  const claims = await verifyAccessToken({
    access_token: token,
    app_id: appId,
    verification_key: verificationKey,
  });

  return {
    userId: claims.user_id,
    sessionId: claims.session_id,
    appId: claims.app_id,
  };
}
