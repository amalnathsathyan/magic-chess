// Agent helpers and workflow, against the built package (run `npm run build` first).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  MAGIC_CHESS_IDL,
  MagicChessClient,
  PieceType,
  ZUG_DEVNET,
  buildPayoutAccountInstructions,
  buildStakeInstructions,
  connectMagicChess,
  fenToBoard,
  keypairWallet,
  matchToFen,
  moveToUci,
  newMatchId,
  parseTokenAmount,
  playerColor,
  secondsLeftToMove,
  uciToMove,
  zugPlayUrl,
} from "../dist/index.js";
import { Program } from "@anchor-lang/core";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** A ChessMatch as the client returns it, from a FEN. */
function matchFromFen(fen, overrides = {}) {
  const state = fenToBoard(fen);
  const lower = { Pawn: "pawn", Knight: "knight", Bishop: "bishop", Rook: "rook", Queen: "queen", King: "king" };
  return {
    matchId: "mc-test",
    players: [Keypair.generate().publicKey, Keypair.generate().publicKey],
    board: state.board.map((row) =>
      row.map((p) => (p ? { pieceType: lower[p.pieceType], color: p.color.toLowerCase() } : null))
    ),
    currentTurn: state.currentTurn,
    castlingRights: state.castlingRights,
    enPassantTarget: state.enPassantTarget,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    gameStatus: "active",
    lastMoveTimestamp: 1_000n,
    moveTimeoutDuration: 300n,
    ...overrides,
  };
}

test("matchToFen round-trips the client's lowercase board", () => {
  assert.equal(matchToFen(matchFromFen(START_FEN)), START_FEN);
  const sicilian = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2";
  assert.equal(matchToFen(matchFromFen(sicilian)), sicilian);
});

test("uciToMove and moveToUci", () => {
  assert.deepEqual(uciToMove("e2e4"), { fromRow: 1, fromCol: 4, toRow: 3, toCol: 4, promotion: undefined });
  assert.equal(uciToMove("a7a8q").promotion, PieceType.Queen);
  assert.equal(uciToMove("h2h1N").promotion, PieceType.Knight);
  for (const uci of ["e2e4", "g1f3", "a7a8q", "b2b1n"]) assert.equal(moveToUci(uciToMove(uci)), uci);
  assert.throws(() => uciToMove("e2"), /Invalid UCI/);
  assert.throws(() => uciToMove("e9e4"), /Invalid UCI/);
  assert.throws(() => uciToMove("e7e8k"), /Invalid UCI/);
});

test("parseTokenAmount avoids floating point", () => {
  assert.equal(parseTokenAmount("0.01", 9), 10_000_000n);
  assert.equal(parseTokenAmount("1", 9), 1_000_000_000n);
  assert.equal(parseTokenAmount("0.1", 9) * 3n, 300_000_000n);
  assert.equal(parseTokenAmount("0", 9), 0n);
  assert.throws(() => parseTokenAmount("0.0000000001", 9), /decimal places/);
  assert.throws(() => parseTokenAmount("-1", 9), /Invalid amount/);
  assert.throws(() => parseTokenAmount("abc", 9), /Invalid amount/);
});

test("newMatchId fits the program's 32-byte limit and the app's format", () => {
  const id = newMatchId();
  assert.match(id, /^mc-[0-9a-f]{20}$/);
  assert.notEqual(newMatchId(), id);
  assert.throws(() => newMatchId("x".repeat(20)), /32 bytes/);
});

test("playerColor, secondsLeftToMove and zugPlayUrl", () => {
  const match = matchFromFen(START_FEN);
  assert.equal(playerColor(match, match.players[0]), "white");
  assert.equal(playerColor(match, match.players[1]), "black");
  assert.equal(playerColor(match, Keypair.generate().publicKey), null);
  assert.equal(secondsLeftToMove(match, 1_100), 200);
  assert.equal(secondsLeftToMove({ ...match, moveTimeoutDuration: 0n }, 1_100), null);
  assert.equal(secondsLeftToMove({ ...match, gameStatus: "whiteWins" }, 1_100), null);
  assert.equal(zugPlayUrl("mc-a b"), "https://playzug.xyz/play?id=mc-a%20b");
});

function fakeConnection({ lamports = 0n, wrapped = null } = {}) {
  return {
    rpcEndpoint: "http://fake",
    getBalance: async () => Number(lamports),
    getTokenAccountBalance: async () => {
      if (wrapped === null) throw new Error("could not find account");
      return { value: { amount: wrapped.toString() } };
    },
  };
}

test("buildStakeInstructions wraps only the missing SOL", async () => {
  const owner = Keypair.generate().publicKey;
  const free = await buildStakeInstructions({ connection: fakeConnection(), owner, mint: NATIVE_MINT, amount: 0n });
  assert.equal(free.instructions.length, 1);
  assert.ok(free.instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));

  const staked = await buildStakeInstructions({
    connection: fakeConnection({ lamports: 50_000_000n, wrapped: 4_000_000n }),
    owner,
    mint: NATIVE_MINT,
    amount: 10_000_000n,
  });
  assert.equal(staked.instructions.length, 3);
  assert.ok(staked.instructions[1].programId.equals(SystemProgram.programId));
  // SystemProgram.transfer: u32 index then u64 lamports.
  assert.equal(staked.instructions[1].data.readBigUInt64LE(4), 6_000_000n);
  assert.ok(staked.instructions[2].programId.equals(TOKEN_PROGRAM_ID));

  await assert.rejects(
    buildStakeInstructions({ connection: fakeConnection({ lamports: 1n }), owner, mint: NATIVE_MINT, amount: 10_000_000n }),
    /This stake needs 0.01 SOL more/
  );
});

test("buildPayoutAccountInstructions dedupes owners", () => {
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;
  const { accounts, instructions } = buildPayoutAccountInstructions(a, NATIVE_MINT, [a, b, a]);
  assert.equal(accounts.length, 3);
  assert.ok(accounts[0].equals(accounts[2]));
  assert.equal(instructions.length, 2);
});

test("keypairWallet signs and connectMagicChess wires the client", async () => {
  const keypair = Keypair.generate();
  const client = connectMagicChess({ keypair, indexerUrl: null });
  assert.ok(client instanceof MagicChessClient);
  assert.ok(client.wallet.publicKey.equals(keypair.publicKey));
  assert.equal(client.indexerUrl, undefined);
  assert.equal(client.routerEndpoint, ZUG_DEVNET.routerEndpoint);
  assert.equal(connectMagicChess().wallet, undefined);
  assert.equal(connectMagicChess({ keypair }).indexerUrl, ZUG_DEVNET.apiUrl);
});

test("openMatch sends stake prep and initialize_match in one transaction", async () => {
  const keypair = Keypair.generate();
  const sent = [];
  const provider = {
    connection: fakeConnection({ lamports: 1_000_000_000n }),
    publicKey: keypair.publicKey,
    wallet: keypairWallet(keypair),
    sendAndConfirm: async (tx) => {
      sent.push(tx);
      return "5".repeat(88);
    },
  };
  const program = new Program(MAGIC_CHESS_IDL, provider);
  const client = new MagicChessClient(program, keypairWallet(keypair));
  const { matchId, signature } = await client.openMatch({ stake: 10_000_000n, moveTimeoutSeconds: 60 });

  assert.match(matchId, /^mc-/);
  assert.equal(signature, "5".repeat(88));
  assert.equal(sent.length, 1);
  const programs = sent[0].instructions.map((ix) => ix.programId.toBase58());
  assert.deepEqual(programs, [
    ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(),
    TOKEN_PROGRAM_ID.toBase58(),
    MAGIC_CHESS_IDL.address,
  ]);
  const init = program.coder.instruction.decode(sent[0].instructions[3].data);
  assert.equal(init.name, "initializeMatch");
  assert.equal(init.data.matchIdArg, matchId);
  assert.equal(init.data.betAmountArg.toString(), "10000000");
  assert.equal(init.data.moveTimeoutDurationArg.toString(), "60");
  assert.equal(init.data.platformFeeBasisPointsArg, ZUG_DEVNET.platformFeeBasisPoints);
  assert.ok(new PublicKey(init.data.platformFeeWalletArg).equals(ZUG_DEVNET.platformFeeWallet));
});

test("zug CLI prints help and JSON errors", () => {
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  assert.match(execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" }), /open \[--stake SOL\]/);
  try {
    execFileSync(process.execPath, [cli, "open", "--keypair", "/nonexistent/key.json"], { encoding: "utf8", stdio: "pipe" });
    assert.fail("expected a non-zero exit");
  } catch (error) {
    assert.equal(error.status, 1);
    assert.match(JSON.parse(error.stderr).error, /No keypair at/);
  }
});
