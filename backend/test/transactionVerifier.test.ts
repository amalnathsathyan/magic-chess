import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const PROGRAM_ID = "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h";
const MOVE_DISCRIMINATOR = Buffer.from([116, 181, 208, 158, 192, 84, 32, 251]);
const CREATE_DISCRIMINATOR = Buffer.from([101, 99, 74, 54, 121, 190, 111, 238]);

const borshString = (value: string): Buffer => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
};

const moveEventData = (): Buffer =>
  Buffer.concat([
    MOVE_DISCRIMINATOR,
    borshString("mc-test"),
    PublicKey.default.toBuffer(),
    Buffer.from([0]),
    borshString("e2e4"),
    Buffer.from([1, 4, 3, 4]),
    Buffer.from([0]),
    borshString("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"),
    Buffer.from([0, 0, 0]),
  ]);

test("keeps u64 event values as decimal strings", async () => {
  const { decodeEvent } = await import("../src/services/transactionVerifier.js");
  const amount = 9_007_199_254_740_993n;
  const amountBytes = Buffer.alloc(8);
  amountBytes.writeBigUInt64LE(amount);
  const timeoutBytes = Buffer.alloc(8);
  timeoutBytes.writeBigInt64LE(600n);
  const feeBytes = Buffer.alloc(2);
  feeBytes.writeUInt16LE(100);
  const event = Buffer.concat([
    CREATE_DISCRIMINATOR,
    borshString("mc-large"),
    PublicKey.default.toBuffer(),
    PublicKey.default.toBuffer(),
    amountBytes,
    timeoutBytes,
    feeBytes,
  ]);

  const decoded = decodeEvent(event);
  assert.equal(decoded?.name, "MatchCreatedEvent");
  assert.equal(
    decoded?.name === "MatchCreatedEvent" ? decoded.betAmount : null,
    amount.toString()
  );
});

test("decodes MoveMadeEvent values without losing integer or enum fidelity", async () => {
  const { decodeEvent } = await import("../src/services/transactionVerifier.js");
  assert.deepEqual(decodeEvent(moveEventData()), {
    name: "MoveMadeEvent",
    matchId: "mc-test",
    player: PublicKey.default.toBase58(),
    playerColor: "white",
    algebraicMove: "e2e4",
    fromRow: 1,
    fromCol: 4,
    toRow: 3,
    toCol: 4,
    promotionPiece: null,
    boardFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
  });
});

test("accepts event logs only while Magic Chess is the active program", async () => {
  const { programEvents } = await import("../src/services/transactionVerifier.js");
  const encoded = moveEventData().toString("base64");
  const logs = [
    "Program 11111111111111111111111111111111 invoke [1]",
    `Program data: ${encoded}`,
    "Program 11111111111111111111111111111111 success",
    `Program ${PROGRAM_ID} invoke [1]`,
    `Program data: ${encoded}`,
    `Program ${PROGRAM_ID} success`,
  ];

  assert.equal(programEvents(logs).length, 1);
});
