import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

// Integration test against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://... npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

test("faucet claims: one signup per wallet and per user, one drip per day", { skip: !enabled }, async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { sql } = await import("../src/db/pool.js");
  await runMigrations();

  const wallet = Keypair.generate().publicKey.toBase58();
  const otherWallet = Keypair.generate().publicKey.toBase58();
  const user = `did:privy:test-${Date.now()}`;
  const insert = (w: string, u: string, kind: string, day: string) =>
    sql.unsafe(
      `INSERT INTO faucet_claims (privy_user_id, wallet, kind, claim_day, amount, mint)
       VALUES ($1, $2, $3, $4::date, 1, 'mint') ON CONFLICT DO NOTHING RETURNING id`,
      [u, w, kind, day]
    );

  try {
    assert.equal((await insert(wallet, user, "signup", "2026-10-30")).length, 1);
    // Same user, another wallet: no second signup bonus.
    assert.equal((await insert(otherWallet, user, "signup", "2026-10-31")).length, 0);
    // Same wallet, another user: no second signup bonus either.
    assert.equal((await insert(wallet, "did:privy:other", "signup", "2026-10-31")).length, 0);
    assert.equal((await insert(wallet, user, "daily", "2026-10-31")).length, 1);
    assert.equal((await insert(wallet, user, "daily", "2026-10-31")).length, 0);
    assert.equal((await insert(wallet, user, "daily", "2026-11-01")).length, 1);
  } finally {
    await sql.unsafe(`DELETE FROM faucet_claims WHERE privy_user_id IN ($1, 'did:privy:other')`, [user]);
    await sql.end({ timeout: 5 });
  }
});
