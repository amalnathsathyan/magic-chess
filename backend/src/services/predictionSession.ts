import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifySolanaMessageSignature } from "./walletProof.js";

/**
 * Wallet-bound sessions for play-point predictions.
 *
 * The wallet signs one human-readable message; the backend returns an HMAC
 * token tied to that wallet. Predictions are keyed by wallet (not Privy user)
 * so match players can be reliably excluded from their own markets.
 */

export const PREDICTION_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PROOF_MAX_AGE_MS = 5 * 60 * 1000;
const PROOF_FUTURE_SKEW_MS = 30 * 1000;

export function predictionSessionMessage(wallet: string, issuedAt: number): string {
  return [
    "Magic Chess predictions",
    "Sign in to predict moves with play points. This costs nothing.",
    `wallet:${wallet}`,
    `issued-at:${issuedAt}`,
  ].join("\n");
}

export class PredictionSessions {
  private readonly secret: Buffer;

  constructor(secret?: string) {
    // Without a configured secret, sessions simply reset on restart.
    this.secret = secret ? Buffer.from(secret, "utf8") : randomBytes(32);
  }

  issue(args: {
    wallet: string;
    issuedAt: number;
    signature: string;
    now?: number;
  }): { token: string; expiresAt: number } {
    const now = args.now ?? Date.now();
    if (
      !Number.isSafeInteger(args.issuedAt) ||
      args.issuedAt < now - PROOF_MAX_AGE_MS ||
      args.issuedAt > now + PROOF_FUTURE_SKEW_MS
    ) {
      throw new Error("Sign-in request expired. Try again.");
    }
    const message = predictionSessionMessage(args.wallet, args.issuedAt);
    if (!verifySolanaMessageSignature(args.wallet, message, args.signature)) {
      throw new Error("Wallet signature is invalid.");
    }
    const expiresAt = now + PREDICTION_SESSION_TTL_MS;
    const payload = `${args.wallet}.${expiresAt}`;
    return { token: `${payload}.${this.mac(payload)}`, expiresAt };
  }

  /** Returns the wallet for a valid, unexpired token, else null. */
  verify(token: string | undefined, now = Date.now()): string | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [wallet, expiresAt, mac] = parts;
    const expected = Buffer.from(this.mac(`${wallet}.${expiresAt}`));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (!(Number(expiresAt) > now)) return null;
    return wallet;
  }

  private mac(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}
