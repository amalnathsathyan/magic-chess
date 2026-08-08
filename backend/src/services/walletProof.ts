import { createPublicKey, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export const PLAYER_PROOF_MAX_AGE_MS = 5 * 60 * 1000;
export const PLAYER_PROOF_FUTURE_SKEW_MS = 30 * 1000;

export function playerSessionMessage(
  matchId: string,
  wallet: string,
  issuedAt: number
): string {
  return [
    "Magic Chess realtime session",
    `match:${matchId}`,
    `wallet:${wallet}`,
    `issued-at:${issuedAt}`,
  ].join("\n");
}

export function isFreshPlayerProof(issuedAt: number, now = Date.now()): boolean {
  return (
    Number.isSafeInteger(issuedAt) &&
    issuedAt >= now - PLAYER_PROOF_MAX_AGE_MS &&
    issuedAt <= now + PLAYER_PROOF_FUTURE_SKEW_MS
  );
}

export function verifyPlayerSessionSignature(args: {
  matchId: string;
  wallet: string;
  issuedAt: number;
  signature: string;
}): boolean {
  try {
    const publicKeyBytes = new PublicKey(args.wallet).toBuffer();
    const signature = Buffer.from(args.signature, "base64");
    if (signature.length !== 64) return false;

    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(
        playerSessionMessage(args.matchId, args.wallet, args.issuedAt),
        "utf8"
      ),
      publicKey,
      signature
    );
  } catch {
    return false;
  }
}
