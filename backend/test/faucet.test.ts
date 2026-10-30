import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildClaimInstructions,
  decideClaim,
  formatBaseAmount,
  nextUtcMidnight,
  tokenAmountToBase,
  utcDay,
} from "../src/services/faucet.js";

const NOON = Date.UTC(2026, 9, 30, 12, 0, 0); // 2026-10-30T12:00Z

test("the first claim is the signup bonus", () => {
  assert.deepEqual(decideClaim({ signupDay: null, lastDailyDay: null }, NOON), {
    available: "signup",
    nextAt: null,
  });
});

test("the signup day has no daily drip; the next day does", () => {
  assert.deepEqual(decideClaim({ signupDay: "2026-10-30", lastDailyDay: null }, NOON), {
    available: null,
    nextAt: "2026-10-31T00:00:00.000Z",
  });
  assert.deepEqual(decideClaim({ signupDay: "2026-10-29", lastDailyDay: null }, NOON), {
    available: "daily",
    nextAt: null,
  });
});

test("one daily drip per UTC day, even for a claim seconds before midnight", () => {
  const lateNight = Date.UTC(2026, 9, 30, 23, 59, 50);
  assert.equal(decideClaim({ signupDay: "2026-10-01", lastDailyDay: "2026-10-30" }, lateNight).available, null);
  assert.equal(decideClaim({ signupDay: "2026-10-01", lastDailyDay: "2026-10-30" }, lateNight + 20_000).available, "daily");
  assert.equal(decideClaim({ signupDay: "2026-10-01", lastDailyDay: "2026-10-29" }, NOON).available, "daily");
});

test("UTC day helpers", () => {
  assert.equal(utcDay(NOON), "2026-10-30");
  assert.equal(nextUtcMidnight(NOON).toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(nextUtcMidnight(Date.UTC(2026, 11, 31, 23, 0)).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("amounts convert with the mint's decimals", () => {
  assert.equal(tokenAmountToBase(10_000, 6), 10_000_000_000n);
  assert.equal(formatBaseAmount(10_000_000_000n, 6), "10000");
  assert.equal(formatBaseAmount(1_500_000n, 6), "1.5");
  assert.throws(() => tokenAmountToBase(1.5, 6));
});

test("a claim creates the player's token account on the sponsor's dime and transfers from the treasury", () => {
  const feePayer = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const [createAta, transfer] = buildClaimInstructions({
    feePayer,
    treasury,
    mint,
    decimals: 6,
    recipient,
    amount: 10_000_000_000n,
  });

  assert.equal(createAta.programId.toBase58(), "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  assert.deepEqual(createAta.data, Buffer.from([1])); // idempotent
  assert.ok(createAta.keys[0].pubkey.equals(feePayer) && createAta.keys[0].isSigner);
  assert.ok(createAta.keys[1].pubkey.equals(getAssociatedTokenAddressSync(mint, recipient)));
  assert.ok(createAta.keys[2].pubkey.equals(recipient));
  assert.ok(createAta.keys[3].pubkey.equals(mint));

  assert.equal(transfer.programId.toBase58(), "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  assert.equal(transfer.data[0], 12); // TransferChecked
  assert.equal(transfer.data.readBigUInt64LE(1), 10_000_000_000n);
  assert.equal(transfer.data[9], 6);
  const [source, mintKey, destination, authority] = transfer.keys;
  assert.ok(source.pubkey.equals(getAssociatedTokenAddressSync(mint, treasury)));
  assert.ok(mintKey.pubkey.equals(mint));
  assert.ok(destination.pubkey.equals(getAssociatedTokenAddressSync(mint, recipient)));
  assert.ok(authority.pubkey.equals(treasury) && authority.isSigner);
  // The recipient never signs: the treasury and the fee payer do.
  for (const instruction of [createAta, transfer]) {
    assert.ok(instruction.keys.every((key) => !key.isSigner || !key.pubkey.equals(recipient)));
  }
  assert.ok(PublicKey.isOnCurve(recipient.toBytes()));
});
