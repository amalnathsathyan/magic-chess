import "./helpers/env.js";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import bs58 from "bs58";
import Fastify from "fastify";
import { Keypair } from "@solana/web3.js";

// Integration test against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://... npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    address: bs58.encode(raw),
    sign: (message: string) => sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64"),
  };
}

test("finished games are rated, listed, replayable and shown on profiles", { skip: !enabled }, async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { sql } = await import("../src/db/pool.js");
  const { ingestEvent } = await import("../src/services/eventIngest.js");
  const { matchRoutes } = await import("../src/routes/matches.js");
  const { playerRoutes } = await import("../src/routes/players.js");
  const { leaderboardRoutes } = await import("../src/routes/leaderboard.js");
  await runMigrations();

  const app = Fastify();
  matchRoutes(app);
  playerRoutes(app);
  leaderboardRoutes(app);

  const alice = wallet();
  const bob = wallet();
  const key = () => Keypair.generate().publicKey.toBase58();
  const sig = () => `${key()}${key()}`.slice(0, 88);
  let slot = 1;
  const ingest = (event: Parameters<typeof ingestEvent>[0]["event"]) =>
    ingestEvent({ event, signature: sig(), slot: slot++, eventIndex: 0, blockTime: null });

  const fens = [
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  ];
  const moves = [
    { uci: "e2e4", from: [1, 4], to: [3, 4], color: "white" as const },
    { uci: "e7e5", from: [6, 4], to: [4, 4], color: "black" as const },
    { uci: "g1f3", from: [0, 6], to: [2, 5], color: "white" as const },
  ];

  async function playGame(white: string, black: string, status: "whiteWins" | "blackWins" | "draw") {
    const matchId = `mc-${Math.random().toString(16).slice(2, 22).padEnd(20, "0")}`;
    await ingest({
      name: "MatchCreatedEvent", matchId, creator: white,
      bettingTokenMint: key(), betAmount: "0", moveTimeoutDuration: "180",
      platformFeeBasisPoints: 100,
    });
    await ingest({
      name: "PlayerJoinedEvent", matchId, playerOne: white, playerTwo: black,
      bettingTokenMint: key(), betAmountPerPlayer: "0",
    });
    for (const [index, move] of moves.entries()) {
      const result = await ingest({
        name: "MoveMadeEvent", matchId, player: move.color === "white" ? white : black,
        playerColor: move.color, algebraicMove: move.uci,
        fromRow: move.from[0], fromCol: move.from[1], toRow: move.to[0], toCol: move.to[1],
        promotionPiece: null, isCheck: false, isCheckmate: false, isStalemate: false,
        boardFen: fens[index],
      });
      assert.equal(result.status, "applied");
    }
    await ingest({
      name: "GameEndedEvent", matchId, status,
      winner: status === "whiteWins" ? "white" : status === "blackWins" ? "black" : null,
      reason: status === "draw" ? "threefoldRepetition" : "resignation",
    } as Parameters<typeof ingestEvent>[0]["event"]);
    return matchId;
  }

  try {
    const first = await playGame(alice.address, bob.address, "whiteWins");
    await playGame(bob.address, alice.address, "draw");

    // Ratings: equal 1200s, Alice wins (+20/-20), then a draw at 1220 vs 1180.
    const [rated] = await sql`
      SELECT white_rating, black_rating, white_rating_change, black_rating_change
      FROM matches WHERE match_id = ${first}
    `;
    assert.deepEqual(
      [rated.whiteRating, rated.blackRating, rated.whiteRatingChange, rated.blackRatingChange],
      [1200, 1200, 20, -20]
    );

    // Profile edit, signed by the wallet.
    const edit = { displayName: `alice_${Date.now() % 100000}`, bio: "Loves the Italian", avatar: "knight" };
    const challenge = await app.inject({
      method: "POST", url: `/api/players/${alice.address}/profile/challenge`, payload: edit,
    });
    assert.equal(challenge.statusCode, 200);
    const { issuedAt, message } = challenge.json();
    const forged = await app.inject({
      method: "PUT", url: `/api/players/${alice.address}/profile`,
      payload: { ...edit, issuedAt, signature: bob.sign(message) },
    });
    assert.equal(forged.statusCode, 401);
    const saved = await app.inject({
      method: "PUT", url: `/api/players/${alice.address}/profile`,
      payload: { ...edit, issuedAt, signature: alice.sign(message) },
    });
    assert.equal(saved.statusCode, 200, saved.body);

    // Names are unique regardless of case.
    const taken = edit.displayName.toUpperCase();
    const bobChallenge = (await app.inject({
      method: "POST", url: `/api/players/${bob.address}/profile/challenge`,
      payload: { displayName: taken },
    })).json();
    const clash = await app.inject({
      method: "PUT", url: `/api/players/${bob.address}/profile`,
      payload: { displayName: taken, issuedAt: bobChallenge.issuedAt, signature: bob.sign(bobChallenge.message) },
    });
    assert.equal(clash.statusCode, 409);

    const profile = (await app.inject({ url: `/api/players/${alice.address}/profile` })).json();
    assert.equal(profile.displayName, edit.displayName);
    assert.equal(profile.avatar, "knight");
    assert.equal(profile.stats.totalGames, 2);
    assert.equal(profile.byColor.white.wins, 1);
    assert.equal(profile.byColor.black.draws, 1);
    assert.deepEqual(profile.recentForm.map((g: { result: string }) => g.result), ["draw", "win"]);
    assert.equal(profile.ratingHistory.length, 2);
    assert.equal(profile.ratingHistory[0].rating, 1220);
    assert.equal(profile.openings.white[0].move, "e4");
    assert.equal(profile.openings.black[0].move, "1. e4 e5");
    assert.equal(profile.rating, profile.ratingHistory[1].rating);

    // Public history: everyone sees finished games, newest first, with names.
    const list = (await app.inject({ url: "/api/matches?status=Completed&limit=5" })).json();
    const listed = list.matches.find((m: { matchId: string }) => m.matchId === first);
    assert.ok(listed);
    assert.equal(listed.whiteName, edit.displayName);
    assert.equal(listed.moveCount, 3);

    // Replay data: every ply's position plus the result.
    const history = (await app.inject({ url: `/api/matches/${first}/history` })).json();
    assert.equal(history.gameStatus, "WhiteWins");
    assert.equal(history.gameEndReason, "Resignation");
    assert.deepEqual(history.moves.map((m: { san: string }) => m.san), ["e4", "e5", "Nf3"]);
    assert.equal(history.moves[2].fenAfter, fens[2]);
    assert.equal(history.white.name, edit.displayName);
    assert.equal(history.white.ratingChange, 20);

    // Profile match list filters by result.
    const wins = (await app.inject({ url: `/api/players/${alice.address}/matches?result=win` })).json();
    assert.deepEqual(wins.matches.map((m: { matchId: string }) => m.matchId), [first]);

    const board = (await app.inject({ url: "/api/leaderboard?sortBy=rating&limit=100" })).json();
    assert.ok(board.leaderboard.some((p: { playerPubkey: string; displayName: string | null }) =>
      p.playerPubkey === alice.address && p.displayName === edit.displayName));
  } finally {
    await app.close();
    await sql.end({ timeout: 2 });
  }
});
