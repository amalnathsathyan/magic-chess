import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import type { MatchAccount } from "../src/services/matchState.js";

// Integration test against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://... npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FINAL = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

test("games missed by the event log are rebuilt from match accounts, counted once", { skip: !enabled }, async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { sql } = await import("../src/db/pool.js");
  const { reconcileMatch } = await import("../src/services/matchReconciler.js");
  const { ingestEvent } = await import("../src/services/eventIngest.js");
  const { matchRoutes } = await import("../src/routes/matches.js");
  const { playerRoutes } = await import("../src/routes/players.js");
  const Fastify = (await import("fastify")).default;
  await runMigrations();

  const white = Keypair.generate().publicKey.toBase58();
  const black = Keypair.generate().publicKey.toBase58();
  const matchId = `mc-${Math.random().toString(16).slice(2, 22).padEnd(20, "0")}`;
  const now = Math.floor(Date.now() / 1000);
  const account = (overrides: Partial<MatchAccount>): MatchAccount => ({
    matchId,
    white,
    black: null,
    currentTurn: "white",
    gameStatus: "waitingForOpponent",
    endReason: null,
    lastMoveTimestamp: now,
    moveTimeoutSeconds: 180,
    fen: START,
    pliesPlayed: 0,
    wager: { mint: Keypair.generate().publicKey.toBase58(), betPerPlayer: "0", totalPot: "0", feeBps: 100, payoutProcessed: false },
    ...overrides,
  });

  // Never seen by the event log: the sweep finds it waiting, then finished.
  assert.equal(await reconcileMatch(account({})), "inserted");
  assert.equal(await reconcileMatch(account({})), "unchanged");
  assert.equal(
    await reconcileMatch(
      account({
        black,
        gameStatus: "blackWins",
        endReason: "Checkmate",
        fen: FINAL,
        pliesPlayed: 4,
      })
    ),
    "ended"
  );

  const [row] = await sql`
    SELECT game_status, game_end_reason, black_player, current_fen, ply_count,
           white_rating_change, black_rating_change, white_xp, black_xp, index_source
    FROM matches WHERE match_id = ${matchId}
  `;
  assert.equal(row.gameStatus, "BlackWins");
  assert.equal(row.gameEndReason, "Checkmate");
  assert.equal(row.blackPlayer, black);
  assert.equal(row.currentFen, FINAL);
  assert.equal(row.plyCount, 4);
  assert.equal(row.blackRatingChange > 0, true);
  assert.equal(row.whiteRatingChange < 0, true);
  // A 4-ply game is a short game: 2 XP each, no win bonus.
  assert.equal(row.whiteXp, 2);
  assert.equal(row.blackXp, 2);
  assert.equal(row.indexSource, "account");

  // The real GameEnded event arriving later is a duplicate, not a second result.
  const late = await ingestEvent({
    event: { name: "GameEndedEvent", matchId, status: "blackWins", winner: "black", reason: "checkmate" },
    signature: `${Keypair.generate().publicKey.toBase58()}x`,
    slot: 1,
    eventIndex: 0,
    blockTime: null,
  });
  assert.equal(late.status, "duplicate");
  assert.equal(await reconcileMatch(account({ black, gameStatus: "blackWins", fen: FINAL, pliesPlayed: 4 })), "unchanged");

  const stats = await sql`
    SELECT player_pubkey, total_games, wins, losses, xp FROM player_stats
    WHERE player_pubkey IN (${white}, ${black})
  `;
  const byWallet = new Map(stats.map((s) => [s.playerPubkey, s]));
  assert.equal(byWallet.get(black)?.wins, 1);
  assert.equal(byWallet.get(black)?.totalGames, 1);
  assert.equal(byWallet.get(white)?.losses, 1);
  assert.equal(byWallet.get(black)?.xp, 2);

  // The reviewed game says its moves are missing rather than showing none.
  const app = Fastify();
  matchRoutes(app);
  playerRoutes(app);
  const history = (await app.inject({ url: `/api/matches/${matchId}/history` })).json();
  assert.equal(history.finalFen, FINAL);
  assert.equal(history.plyCount, 4);
  assert.equal(history.movesComplete, false);
  assert.equal(history.black.xp, 2);

  const profile = (await app.inject({ url: `/api/players/${black}/profile` })).json();
  assert.equal(profile.xp.xp, 2);
  assert.equal(profile.xp.level, 1);
  assert.equal(profile.recentXp[0].matchId, matchId);

  await app.close();
  await sql`DELETE FROM matches WHERE match_id = ${matchId}`;
  await sql`DELETE FROM player_stats WHERE player_pubkey IN (${white}, ${black})`;
});
