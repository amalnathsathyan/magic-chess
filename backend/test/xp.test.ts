import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { levelFor, totalXp, xpForGame, xpToReachLevel } from "../src/services/xp.js";
import { decodeMatchAccount } from "../src/services/matchState.js";

const game = (overrides: Partial<Parameters<typeof xpForGame>[0]> = {}) =>
  totalXp(
    xpForGame({
      score: 1,
      plies: 40,
      firstWinToday: false,
      earlierGamesVsOpponentToday: 0,
      ...overrides,
    })
  );

test("a win earns more than a draw, which earns more than a loss", () => {
  assert.equal(game({ score: 1 }), 10 + 20 + 10);
  assert.equal(game({ score: 0.5 }), 10 + 8 + 10);
  assert.equal(game({ score: 0 }), 10 + 10);
});

test("long games earn a capped length bonus", () => {
  assert.equal(game({ score: 0, plies: 20 }), 10);
  assert.equal(game({ score: 0, plies: 200 }), 10 + 15);
});

test("the first win of the day earns a bonus, but only for a win", () => {
  assert.equal(game({ firstWinToday: true }) - game(), 25);
  assert.equal(game({ score: 0, firstWinToday: true }), game({ score: 0 }));
});

test("instant games and same-opponent farming earn little or nothing", () => {
  assert.equal(game({ plies: 3, firstWinToday: true }), 2);
  assert.equal(game({ earlierGamesVsOpponentToday: 4 }) > 0, true);
  assert.equal(game({ earlierGamesVsOpponentToday: 5 }), 0);
});

test("levels and tiers follow the XP curve", () => {
  assert.deepEqual(levelFor(0), { xp: 0, level: 1, tier: "Pawn", levelXp: 0, levelSpan: 100 });
  assert.equal(levelFor(99).level, 1);
  assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(xpToReachLevel(5)).tier, "Knight");
  assert.equal(levelFor(xpToReachLevel(30)).tier, "King");
  const mid = levelFor(xpToReachLevel(7) + 40);
  assert.equal(mid.level, 7);
  assert.equal(mid.levelXp, 40);
  assert.equal(mid.levelSpan, 250);
});

test("decodes a ChessMatch account into players, status and FEN", () => {
  const white = Keypair.generate().publicKey;
  const black = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const parts: Buffer[] = [Buffer.from([72, 241, 122, 67, 252, 229, 79, 237])];
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const u64 = (n: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n);
    return b;
  };
  const matchId = "mc-0123456789abcdef0123";
  parts.push(u32(matchId.length), Buffer.from(matchId));
  parts.push(white.toBuffer(), black.toBuffer());
  parts.push(Buffer.from([1, 1])); // current_player_idx, turn = black
  parts.push(u64(1_700_000_000n), u64(180n));
  parts.push(Buffer.from([2, 1, 0])); // WhiteWins, Some(Checkmate)
  // Board after 1. e4: row 0 = rank 1.
  const back = [3, 1, 2, 4, 5, 2, 1, 3];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      let piece: [number, number] | null = null;
      if (row === 0) piece = [back[col], 0];
      if (row === 1 && col !== 4) piece = [0, 0];
      if (row === 3 && col === 4) piece = [0, 0];
      if (row === 6) piece = [0, 1];
      if (row === 7) piece = [back[col], 1];
      parts.push(piece ? Buffer.from([1, ...piece]) : Buffer.from([0]));
    }
  }
  parts.push(Buffer.from([1, 1, 1, 1])); // castling
  parts.push(Buffer.from([1, 2, 4])); // en passant e3
  parts.push(Buffer.from([0])); // halfmove
  parts.push(Buffer.from([1, 0])); // fullmove 1
  parts.push(u32(1), u64(42n)); // position history
  parts.push(mint.toBuffer(), u64(5n), u64(5n), u64(10n), Buffer.from([100, 0]));
  parts.push(Keypair.generate().publicKey.toBuffer(), Buffer.from([1]));

  const account = decodeMatchAccount(Buffer.concat(parts));
  assert.equal(account.matchId, matchId);
  assert.equal(account.white, white.toBase58());
  assert.equal(account.black, black.toBase58());
  assert.equal(account.gameStatus, "whiteWins");
  assert.equal(account.endReason, "Checkmate");
  assert.equal(account.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
  assert.equal(account.pliesPlayed, 1);
  assert.deepEqual(account.wager, {
    mint: mint.toBase58(),
    betPerPlayer: "5",
    totalPot: "10",
    feeBps: 100,
    payoutProcessed: true,
  });

  // An older program layout without the wager tail still decodes the head.
  const head = decodeMatchAccount(Buffer.concat(parts.slice(0, -4)));
  assert.equal(head.wager, null);
  assert.equal(head.gameStatus, "whiteWins");
});
