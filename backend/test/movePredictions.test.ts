import "./helpers/env.js";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  isValidSan,
  normalizeSan,
  sanFromUci,
  settleBets,
  INITIAL_FEN,
} from "../src/services/movePredictions.js";
import { plyFromFen } from "../src/services/eventIngest.js";
import { decodeMatchHead } from "../src/services/matchState.js";
import {
  PredictionSessions,
  predictionSessionMessage,
} from "../src/services/predictionSession.js";

test("normalizes SAN for comparison", () => {
  assert.equal(normalizeSan("Nf3+"), "Nf3");
  assert.equal(normalizeSan("0-0-0"), "O-O-O");
  assert.equal(normalizeSan("exd8Q#"), "exd8=Q");
  assert.equal(normalizeSan(" e4!? "), "e4");
  assert.ok(isValidSan("Qxh7#"));
  assert.ok(isValidSan("O-O"));
  assert.ok(!isValidSan("e9"));
  assert.ok(!isValidSan("hello"));
});

test("derives SAN from the program's coordinate notation", () => {
  assert.equal(sanFromUci(INITIAL_FEN, "e2e4"), "e4");
  assert.equal(sanFromUci(INITIAL_FEN, "g1f3"), "Nf3");
  assert.equal(sanFromUci(INITIAL_FEN, "e2e5"), null);
  const castleFen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  assert.equal(sanFromUci(castleFen, "e1g1"), "O-O");
  const promoFen = "8/P7/8/8/8/8/8/k6K w - - 0 1";
  assert.equal(sanFromUci(promoFen, "a7a8q"), "a8=Q");
});

test("derives ply from the on-chain FEN", () => {
  assert.equal(plyFromFen(INITIAL_FEN), 0);
  assert.equal(plyFromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"), 1);
  assert.equal(plyFromFen("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"), 2);
  assert.throws(() => plyFromFen("garbage"));
});

const bet = (id: number, san: string, stake: number, createdAtMs = 0) => ({
  id,
  wallet: `w${id}`,
  predictedSan: san,
  stake,
  createdAtMs,
});

test("settles parimutuel: winners split losers' pool pro rata", () => {
  const outcomes = settleBets(
    [bet(1, "e4", 100), bet(2, "e4", 300), bet(3, "d4", 200), bet(4, "Nf3", 200)],
    "e4",
    1_000
  );
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  assert.deepEqual(byId.get(1), { id: 1, wallet: "w1", stake: 100, status: "won", payout: 200 });
  assert.equal(byId.get(2)?.payout, 600);
  assert.equal(byId.get(3)?.status, "lost");
  assert.equal(byId.get(4)?.payout, 0);
  const paid = outcomes.reduce((sum, o) => sum + o.payout, 0);
  assert.ok(paid <= 800, "never pays out more than was staked");
});

test("refunds predictions recorded at or after the confirmed move", () => {
  const outcomes = settleBets(
    [bet(1, "e4", 100, 999), bet(2, "e4", 100, 1_000), bet(3, "d4", 100, 500)],
    "e4",
    1_000
  );
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  assert.equal(byId.get(2)?.status, "refunded");
  assert.equal(byId.get(2)?.payout, 100);
  assert.equal(byId.get(1)?.payout, 200);
});

test("refunds everyone when nobody guessed right or there's no one to win from", () => {
  for (const outcomes of [
    settleBets([bet(1, "d4", 100), bet(2, "c4", 50)], "e4", null),
    settleBets([bet(1, "e4", 100), bet(2, "e4", 50)], "e4", null),
  ]) {
    for (const outcome of outcomes) assert.equal(outcome.payout, outcome.stake);
  }
});

function encodeMatch(args: {
  matchId: string;
  turn: 0 | 1;
  status: number;
  fullmove: number;
  occupied: number;
  enPassant: boolean;
}): Buffer {
  const parts: Buffer[] = [Buffer.alloc(8)];
  const id = Buffer.from(args.matchId);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(id.length);
  parts.push(len, id, Keypair.generate().publicKey.toBuffer(), Keypair.generate().publicKey.toBuffer());
  parts.push(Buffer.from([1, args.turn]));
  const times = Buffer.alloc(16);
  times.writeBigInt64LE(1_700_000_000n, 0);
  times.writeBigInt64LE(180n, 8);
  parts.push(times, Buffer.from([args.status, 0]));
  for (let square = 0; square < 64; square += 1) {
    parts.push(square < args.occupied ? Buffer.from([1, 0, 0]) : Buffer.from([0]));
  }
  parts.push(Buffer.from([1, 1, 1, 1]));
  parts.push(args.enPassant ? Buffer.from([1, 2, 4]) : Buffer.from([0]));
  const clocks = Buffer.alloc(3);
  clocks.writeUInt8(0, 0);
  clocks.writeUInt16LE(args.fullmove, 1);
  parts.push(clocks, Buffer.alloc(64)); // trailing fields
  return Buffer.concat(parts);
}

test("decodes turn, status and plies from the ChessMatch account", () => {
  const head = decodeMatchHead(
    encodeMatch({ matchId: "mc-abc", turn: 1, status: 1, fullmove: 5, occupied: 30, enPassant: true })
  );
  assert.equal(head.matchId, "mc-abc");
  assert.equal(head.currentTurn, "black");
  assert.equal(head.gameStatus, "active");
  assert.equal(head.fullmoveNumber, 5);
  assert.equal(head.pliesPlayed, 9);
  assert.equal(head.lastMoveTimestamp, 1_700_000_000);

  const fresh = decodeMatchHead(
    encodeMatch({ matchId: "mc-x", turn: 0, status: 0, fullmove: 1, occupied: 32, enPassant: false })
  );
  assert.equal(fresh.pliesPlayed, 0);
  assert.equal(fresh.gameStatus, "waitingForOpponent");
});

test("issues wallet-bound prediction sessions only for valid signatures", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const address = new PublicKey(raw).toBase58();
  const now = 1_800_000_000_000;
  const message = predictionSessionMessage(address, now);
  const signature = sign(null, Buffer.from(message), privateKey).toString("base64");

  const sessions = new PredictionSessions("secret");
  const { token } = sessions.issue({ wallet: address, issuedAt: now, signature, now });
  assert.equal(sessions.verify(token, now + 1), address);
  assert.equal(sessions.verify(token, now + 13 * 60 * 60 * 1000), null);
  assert.equal(new PredictionSessions("other").verify(token, now), null);
  assert.equal(sessions.verify(token.replace(address, Keypair.generate().publicKey.toBase58()), now), null);

  const other = Keypair.generate().publicKey.toBase58();
  assert.throws(() => sessions.issue({ wallet: other, issuedAt: now, signature, now }));
  assert.throws(() =>
    sessions.issue({ wallet: address, issuedAt: now - 10 * 60_000, signature, now })
  );
});
