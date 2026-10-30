import "./helpers/env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  associatedTokenAddress,
  buildRewardTransfer,
  decideEligibility,
  rewardClaimMessage,
  toBaseUnits,
  type RewardMatchRow,
} from "../src/services/zugconRewards.js";
import type { LiveMatchState } from "../src/services/matchState.js";

const white = Keypair.generate().publicKey.toBase58();
const black = Keypair.generate().publicKey.toBase58();
const stranger = Keypair.generate().publicKey.toBase58();
const settings = { creatorAmount: 20_000, joinerAmount: 10_000, minPlies: 10 };

function row(overrides: Partial<RewardMatchRow> = {}): RewardMatchRow {
  return {
    matchId: "mc-test",
    whitePlayer: white,
    blackPlayer: black,
    gameStatus: "WhiteWins",
    plies: 40,
    payoutProcessed: false,
    endedAt: new Date(),
    ...overrides,
  };
}

function live(overrides: Partial<LiveMatchState> = {}): LiveMatchState {
  return {
    matchId: "mc-test",
    players: [white, black],
    currentTurn: "black",
    gameStatus: "whiteWins",
    fullmoveNumber: 21,
    pliesPlayed: 40,
    lastMoveTimestamp: 0,
    runtime: "base",
    ...overrides,
  };
}

test("the creator gets 20000 and the joiner 10000 when the chain agrees", () => {
  const creator = decideEligibility(row(), white, live(), settings);
  assert.deepEqual([creator.eligible, creator.role, creator.amount], [true, "creator", 20_000]);
  const joiner = decideEligibility(row(), black, live(), settings);
  assert.deepEqual([joiner.eligible, joiner.role, joiner.amount], [true, "joiner", 10_000]);
  const draw = decideEligibility(row({ gameStatus: "Draw" }), black, live({ gameStatus: "draw" }), settings);
  assert.equal(draw.eligible, true);
});

test("no opponent, aborted, unfinished and short games earn nothing", () => {
  assert.equal(decideEligibility(row({ blackPlayer: null }), white, null, settings).code, "no_opponent");
  assert.equal(decideEligibility(row({ gameStatus: "Aborted" }), white, null, settings).code, "aborted");
  assert.equal(decideEligibility(row({ gameStatus: "Active" }), white, null, settings).code, "not_finished");
  assert.equal(
    decideEligibility(row({ gameStatus: "WaitingForOpponent", blackPlayer: null }), white, null, settings).code,
    "no_opponent"
  );
  assert.equal(decideEligibility(row({ plies: 4 }), white, live(), settings).code, "too_short");
  assert.equal(decideEligibility(row(), stranger, live(), settings).code, "not_player");
});

test("the index alone is never enough: the chain must show the same result", () => {
  // Chain still says Active (index ahead or wrong).
  assert.equal(decideEligibility(row(), white, live({ gameStatus: "active" }), settings).code, "chain_mismatch");
  // Chain says the other side won.
  assert.equal(decideEligibility(row(), white, live({ gameStatus: "blackWins" }), settings).code, "chain_mismatch");
  // Different players on chain.
  assert.equal(
    decideEligibility(row(), white, live({ players: [white, stranger] }), settings).code,
    "chain_mismatch"
  );
  // Chain unreadable right now: not a no, a try-again.
  assert.equal(decideEligibility(row(), white, "unavailable", settings).code, "chain_unavailable");
  // Account closed: only fine when the row records a settlement.
  assert.equal(decideEligibility(row(), white, null, settings).code, "chain_mismatch");
  assert.equal(decideEligibility(row({ payoutProcessed: true }), white, null, settings).eligible, true);
});

test("the claim message binds match, wallet and time", () => {
  const message = rewardClaimMessage("mc-1", white, 1_700_000_000_000);
  assert.equal(message, `ZUG Arena reward claim\nmatch:mc-1\nwallet:${white}\nissued-at:1700000000000`);
});

test("amounts convert to base units for a 6-decimal pump.fun mint", () => {
  assert.equal(toBaseUnits(20_000, 6), 20_000_000_000n);
  assert.throws(() => toBaseUnits(1.5, 6));
});

test("the transfer creates the recipient's token account and sends transfer_checked", () => {
  const rewardWallet = Keypair.generate().publicKey;
  const recipient = new PublicKey(black);
  const mint = Keypair.generate().publicKey;
  const [createAta, transfer] = buildRewardTransfer({
    rewardWallet,
    recipient,
    mint,
    amount: 10_000_000_000n,
    decimals: 6,
  });
  assert.equal(createAta.programId.toBase58(), "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  assert.deepEqual([...createAta.data], [1]);
  assert.ok(createAta.keys[0].pubkey.equals(rewardWallet) && createAta.keys[0].isSigner);
  assert.ok(createAta.keys[1].pubkey.equals(associatedTokenAddress(recipient, mint)));
  assert.ok(createAta.keys[2].pubkey.equals(recipient));

  assert.equal(transfer.programId.toBase58(), "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  assert.equal(transfer.data[0], 12);
  assert.equal(transfer.data.readBigUInt64LE(1), 10_000_000_000n);
  assert.equal(transfer.data[9], 6);
  assert.ok(transfer.keys[0].pubkey.equals(associatedTokenAddress(rewardWallet, mint)));
  assert.ok(transfer.keys[2].pubkey.equals(associatedTokenAddress(recipient, mint)));
  assert.ok(transfer.keys[3].pubkey.equals(rewardWallet) && transfer.keys[3].isSigner);
});
