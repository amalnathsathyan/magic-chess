import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  getFen,
  initMatch,
  removeMatch,
} from "../src/services/boardCache.js";

test("initializes and advances a cached board", () => {
  const matchId = "test-initial";
  assert.equal(
    initMatch(matchId),
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  );

  assert.equal(
    applyMove(matchId, {
      fromRow: 1,
      fromCol: 4,
      toRow: 3,
      toCol: 4,
      promotionPiece: null,
      playerColor: "white",
    }),
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
  );
  assert.equal(getFen(matchId)?.split(" ")[1], "b");
  removeMatch(matchId);
});

test("keeps promoted pieces in the mover's FEN color", () => {
  const matchId = "test-promotion";
  initMatch(matchId);
  applyMove(matchId, {
    fromRow: 1,
    fromCol: 0,
    toRow: 6,
    toCol: 0,
    promotionPiece: null,
    playerColor: "white",
  });

  const fen = applyMove(matchId, {
    fromRow: 6,
    fromCol: 0,
    toRow: 7,
    toCol: 0,
    promotionPiece: "Queen",
    playerColor: "white",
  });

  assert.match(fen ?? "", /^Qnbqkbnr\//);
  removeMatch(matchId);
});
