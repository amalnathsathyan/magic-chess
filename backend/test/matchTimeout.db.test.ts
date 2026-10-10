import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { Keypair } from "@solana/web3.js";

// Integration test against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://... npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

test("the live list leaves out games whose clock ran out days ago", { skip: !enabled }, async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { sql } = await import("../src/db/pool.js");
  const { matchRoutes } = await import("../src/routes/matches.js");
  await runMigrations();

  const app = Fastify();
  matchRoutes(app);
  const white = Keypair.generate().publicKey.toBase58();
  const black = Keypair.generate().publicKey.toBase58();
  const id = (label: string) => `mc-${label}${Date.now().toString(16)}`.slice(0, 23);
  const fresh = id("aaaa");
  const stale = id("bbbb");
  const finished = id("cccc");

  try {
    for (const [matchId, status, lastMove] of [
      [fresh, "Active", "NOW() - INTERVAL '30 seconds'"],
      [stale, "Active", "NOW() - INTERVAL '3 days'"],
      [finished, "WhiteWins", "NOW() - INTERVAL '3 days'"],
    ] as const) {
      await sql.unsafe(
        `INSERT INTO matches (match_id, white_player, black_player, game_status, betting_token_mint,
           bet_amount_per_player, move_timeout_seconds, last_move_at, current_fen, ply_count)
         VALUES ($1, $2, $3, $4, 'So11111111111111111111111111111111111111112', 0, 180, ${lastMove},
           'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 1)`,
        [matchId, white, black, status]
      );
    }

    const list = async (query: string) => {
      const response = await app.inject({ url: `/api/matches?player=${white}&${query}` });
      assert.equal(response.statusCode, 200);
      return response.json().matches as Array<{ matchId: string; timedOut: boolean; timedOutSide: string | null }>;
    };

    const live = await list("status=Active&timedOut=false");
    assert.deepEqual(live.map((m) => m.matchId), [fresh]);
    assert.equal(live[0].timedOut, false);

    const stuck = await list("status=Active&timedOut=true");
    assert.deepEqual(stuck.map((m) => [m.matchId, m.timedOut, m.timedOutSide]), [[stale, true, "black"]]);

    // Without the filter every game comes back, each flagged by the same rule.
    const all = await list("limit=10");
    assert.equal(all.length, 3);
    assert.deepEqual(all.filter((m) => m.timedOut).map((m) => m.matchId), [stale]);

    const detail = await app.inject({ url: `/api/matches/${stale}` });
    assert.equal(detail.json().timedOut, true);
    assert.equal(detail.json().currentTurn, "black");
  } finally {
    await sql`DELETE FROM matches WHERE match_id IN (${fresh}, ${stale}, ${finished})`;
    await sql.end({ timeout: 2 });
  }
});
