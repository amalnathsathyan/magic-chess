import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

// Integration test against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://... npm test
const enabled = Boolean(process.env.TEST_DATABASE_URL);

test("move prediction lifecycle: lock, settle, void", { skip: !enabled }, async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { sql } = await import("../src/db/pool.js");
  const { ingestEvent } = await import("../src/services/eventIngest.js");
  const { MovePredictionService, PredictionError } = await import(
    "../src/services/movePredictions.js"
  );
  await runMigrations();

  const key = () => Keypair.generate().publicKey.toBase58();
  const white = key();
  const black = key();
  const [alice, bob, carol] = [key(), key(), key()];
  const matchId = `mc-${Date.now().toString(16)}`.slice(0, 23);
  let slot = 1;
  const sig = () => `${key()}${key()}`.slice(0, 88);
  let pliesPlayed = 0;
  let status: "active" | "whiteWins" = "active";
  const published: string[] = [];

  const service = new MovePredictionService({
    readLiveState: async () => ({
      matchId,
      players: [white, black],
      currentTurn: pliesPlayed % 2 === 0 ? "white" : "black",
      gameStatus: status,
      fullmoveNumber: Math.floor(pliesPlayed / 2) + 1,
      pliesPlayed,
      lastMoveTimestamp: 0,
      runtime: "ephemeral",
    }),
    publish: (_matchId, event) => published.push(event),
  });
  const hooks = {
    onMoveIndexed: ({ matchId: id }: { matchId: string }) => service.onMoveIndexed({ matchId: id }),
    onGameEnded: (args: { matchId: string; finalPly: number }) => service.onGameEnded(args),
  };
  const ingest = (event: Parameters<typeof ingestEvent>[0]["event"], blockTime: number | null = null) =>
    ingestEvent({ event, signature: sig(), slot: slot++, eventIndex: 0, blockTime }, hooks);

  try {
    // A move before the match is indexed is deferred, not dropped.
    const early = await ingest({
      name: "MoveMadeEvent", matchId, player: white, playerColor: "white",
      algebraicMove: "e2e4", fromRow: 1, fromCol: 4, toRow: 3, toCol: 4,
      promotionPiece: null, isCheck: false, isCheckmate: false, isStalemate: false,
      boardFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    });
    assert.equal(early.status, "deferred");

    assert.equal((await ingest({
      name: "MatchCreatedEvent", matchId, creator: white,
      bettingTokenMint: key(), betAmount: "0", moveTimeoutDuration: "180",
      platformFeeBasisPoints: 100,
    })).status, "applied");
    assert.equal((await ingest({
      name: "PlayerJoinedEvent", matchId, playerOne: white, playerTwo: black,
      bettingTokenMint: key(), betAmountPerPlayer: "0",
    })).status, "applied");

    // Players can't predict their own game.
    await assert.rejects(
      service.placeBet({ wallet: white, matchId, ply: 1, san: "e4", stake: 50 }),
      (error: unknown) => error instanceof PredictionError && error.code === "player"
    );
    // Illegal next move is rejected; future plies only need valid notation.
    await assert.rejects(
      service.placeBet({ wallet: alice, matchId, ply: 1, san: "e5", stake: 50 }),
      /isn't a legal move/
    );

    await service.placeBet({ wallet: alice, matchId, ply: 1, san: "e4", stake: 100 });
    await service.placeBet({ wallet: bob, matchId, ply: 1, san: "d4", stake: 100 });
    await service.placeBet({ wallet: carol, matchId, ply: 1, san: "e4", stake: 50 });
    await service.placeBet({ wallet: bob, matchId, ply: 4, san: "Nf6", stake: 40 });
    await assert.rejects(
      service.placeBet({ wallet: alice, matchId, ply: 1, san: "d4", stake: 10 }),
      /already predicted/
    );
    await assert.rejects(
      service.placeBet({ wallet: alice, matchId, ply: 30, san: "e4", stake: 10 }),
      /moves ahead/
    );
    const before = await service.snapshot(matchId);
    assert.equal(before.markets.find((m) => m.ply === 1)?.pool, 250);
    assert.ok(published.includes("prediction.market"));

    // The move confirms on chain: the lock applies before the index catches up.
    pliesPlayed = 1;
    await assert.rejects(
      service.placeBet({ wallet: carol, matchId, ply: 1, san: "e4", stake: 10 }),
      (error: unknown) => error instanceof PredictionError && error.code === "locked"
    );

    // Indexing the verified move settles the ply.
    const moved = await ingest(
      {
        name: "MoveMadeEvent", matchId, player: white, playerColor: "white",
        algebraicMove: "e2e4", fromRow: 1, fromCol: 4, toRow: 3, toCol: 4,
        promotionPiece: null, isCheck: false, isCheckmate: false, isStalemate: false,
        boardFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      },
      Math.floor(Date.now() / 1000) + 60
    );
    assert.equal(moved.status, "applied");
    assert.equal(moved.status === "applied" && moved.moveNumber, 1);

    const accounts = async () =>
      Object.fromEntries(
        await Promise.all(
          [alice, bob, carol].map(async (w) => [w, (await service.getAccount(w)).balance])
        )
      );
    let balances = await accounts();
    assert.equal(balances[alice], 1000 - 100 + 166); // 100 + floor(100*100/150)
    assert.equal(balances[carol], 1000 - 50 + 83); //  50 + floor(100*50/150)
    assert.equal(balances[bob], 1000 - 100 - 40);
    const settled = await service.snapshot(matchId);
    assert.equal(settled.markets.find((m) => m.ply === 1)?.actualSan, "e4");
    assert.ok(published.includes("prediction.settled"));

    // Re-delivery of the same move is a no-op.
    const replay = await ingest({
      name: "MoveMadeEvent", matchId, player: white, playerColor: "white",
      algebraicMove: "e2e4", fromRow: 1, fromCol: 4, toRow: 3, toCol: 4,
      promotionPiece: null, isCheck: false, isCheckmate: false, isStalemate: false,
      boardFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    });
    assert.equal(replay.status, "duplicate");

    // Game ends before ply 4: that market is voided and refunded.
    status = "whiteWins";
    await ingest({
      name: "GameEndedEvent", matchId, status: "whiteWins", winner: "white",
      reason: "resignation",
    });
    balances = await accounts();
    assert.equal(balances[bob], 1000 - 100);
    const [voided] = await sql`
      SELECT status FROM move_markets WHERE match_id = ${matchId} AND ply = 4
    `;
    assert.equal(voided?.status, "void");
    const [matchRow] = await sql`SELECT game_status FROM matches WHERE match_id = ${matchId}`;
    assert.equal(matchRow?.gameStatus, "WhiteWins");
  } finally {
    await sql.end({ timeout: 2 });
  }
});
