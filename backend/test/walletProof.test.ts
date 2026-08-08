import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  type JsonWebKey,
} from "node:crypto";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  isFreshPlayerProof,
  playerSessionMessage,
  verifyPlayerSessionSignature,
} from "../src/services/walletProof.js";

function playerProof(matchId: string, issuedAt: number): {
  wallet: string;
  signature: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  assert.ok(jwk.x);
  const wallet = new PublicKey(Buffer.from(jwk.x, "base64url")).toBase58();
  const signature = sign(
    null,
    Buffer.from(playerSessionMessage(matchId, wallet, issuedAt)),
    privateKey
  ).toString("base64");
  return { wallet, signature };
}

test("verifies a Solana-compatible Ed25519 player session proof", () => {
  const issuedAt = Date.now();
  const proof = playerProof("mc-proof", issuedAt);
  assert.equal(
    verifyPlayerSessionSignature({
      matchId: "mc-proof",
      wallet: proof.wallet,
      issuedAt,
      signature: proof.signature,
    }),
    true
  );
  assert.equal(
    verifyPlayerSessionSignature({
      matchId: "mc-another-match",
      wallet: proof.wallet,
      issuedAt,
      signature: proof.signature,
    }),
    false
  );
});

test("accepts only recent proof timestamps", () => {
  const now = 2_000_000_000_000;
  assert.equal(isFreshPlayerProof(now - 60_000, now), true);
  assert.equal(isFreshPlayerProof(now - 6 * 60_000, now), false);
  assert.equal(isFreshPlayerProof(now + 31_000, now), false);
});
