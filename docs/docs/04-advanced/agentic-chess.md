# Agentic Chess — Building AI Agents on Magic Chess

Magic Chess is uniquely suited for autonomous AI agents. Every game state is on-chain and verifiable, moves are gasless through MagicBlock Ephemeral Rollups, and the prediction market infrastructure lets agents place bets on outcomes. This guide covers how to build three classes of agents — chess-playing bots, spectator predictors, and prediction-market makers — using the `@magic-chess/sdk` TypeScript SDK.

---

## Program Information

| Key | Value |
|-----|-------|
| Program ID (devnet) | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Session Keys Program | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |
| MagicBlock Router (devnet) | `https://devnet-router.magicblock.app/` |
| SDK | `@magic-chess/sdk` |
| License | MIT |

---

## 1. Magic Chess SDK for Agents

The `@magic-chess/sdk` exports a single `MagicChessClient` class that wraps the Anchor `Program<MagicChess>` and provides typed, simulation-checked methods for every on-chain instruction. It also transparently resolves whether an account lives on the base layer or inside a MagicBlock Ephemeral Rollup, so agents do not need to track delegation state manually.

### 1.1 Client Initialization

```typescript
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet, Program } from "@coral-xyz/anchor";
import { MagicChessClient } from "@magic-chess/sdk";
import idl from "./idl/magic_chess.json";

const PROGRAM_ID = new PublicKey(
  "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h"
);

// Base-layer connection for L1 operations (create, join, settle)
const baseConnection = new Connection("https://api.devnet.solana.com", "confirmed");

// Agent wallet — can be a Keypair, a browser wallet, or any MagicChessWallet
const agentKeypair = Keypair.generate();
const wallet = new Wallet(agentKeypair);

const provider = new AnchorProvider(baseConnection, wallet, {
  commitment: "confirmed",
});
const program = new Program(idl as any, provider);

const client = new MagicChessClient(program, wallet);
```

### 1.2 Creating Matches Programmatically

An agent acting as Player 1 (White) calls `createMatch`. The method transfers the wager from the player's associated token account into a PDA-backed escrow owned by the program.

```typescript
import { NATIVE_MINT } from "@solana/spl-token";

const matchId = `agent-${Date.now().toString(36)}`;

const { match, signature } = await client.createMatch({
  matchId,
  betAmount: 0n,                        // 0 = free match
  moveTimeoutDuration: 180,             // 3 minutes per move (blitz)
  platformFeeBasisPoints: 100,          // 1% platform fee
  platformFeeWallet: agentKeypair.publicKey,
  bettingTokenMint: NATIVE_MINT,        // WSOL on devnet
  playerTokenAccount: whiteAta,         // Agent's WSOL ATA
  predictionEnabled: true,              // Enable prediction pool for this match
});

console.log(`Match created: ${match}`);
console.log(`Tx: ${signature}`);
```

Key parameters:
- `matchId` — unique string up to 32 bytes; derive it deterministically for idempotent agent operations.
- `betAmount` — raw token units (0 for free matches, pass a `bigint` for wagered games).
- `predictionEnabled` — set `true` to allow spectators and agents to bet on the outcome.

### 1.3 Joining Matches

Player 2 (Black) discovers joinable matches via `listJoinableMatches` and joins with `joinMatch`.

```typescript
// Discover open matches for a specific token
const openMatches = await client.listJoinableMatches({
  mint: NATIVE_MINT,
});

if (openMatches.length === 0) {
  console.log("No open matches found. Creating one...");
}

// Join the first available match
const target = openMatches[0];
const { signature } = await client.joinMatch({
  matchId: target.matchId,
  playerTokenAccount: blackAta,
});

console.log(`Joined match ${target.matchId}: ${signature}`);
```

The SDK validates the wager amount against on-chain state before submitting, preventing stale-data races: if the `betAmount` parameter mismatches the chain's `betAmountPlayerOne`, the call rejects with a descriptive error.

### 1.4 Reading Board State (FEN) From On-Chain

The agent reads the full `ChessMatch` account, then converts the on-chain board representation to standard FEN notation. The SDK includes `boardToFen` in `@magic-chess/sdk/utils/fen` for this purpose.

```typescript
import { boardToFen } from "@magic-chess/sdk/utils/fen";

// Fetch the full match account
const matchState = await client.getMatch(matchId);
if (!matchState) throw new Error("Match not found");

// The ChessMatch type contains the full board, castling rights, en passant, clocks
const fen = boardToFen(
  matchState.board,
  matchState.currentTurn as "white" | "black",
  {
    whiteKingside: matchState.castlingRights.whiteKingside,
    whiteQueenside: matchState.castlingRights.whiteQueenside,
    blackKingside: matchState.castlingRights.blackKingside,
    blackQueenside: matchState.castlingRights.blackQueenside,
  },
  matchState.enPassantTarget,
  matchState.halfmoveClock,
  matchState.fullmoveNumber
);

console.log(`FEN: ${fen}`);
// Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// Also check game state
console.log(`Status: ${matchState.gameStatus}`);
console.log(`Turn: ${matchState.currentTurn}`);
console.log(`Halfmove clock: ${matchState.halfmoveClock}`);
console.log(`Fullmove number: ${matchState.fullmoveNumber}`);
```

The `ChessMatch` type (defined in `@magic-chess/sdk/types`) exposes every field of the on-chain account:

| Field | Type | Description |
|-------|------|-------------|
| `board` | `(Piece \| null)[][]` | 8x8 grid; `board[row][col]` with row 0 = rank 1 |
| `currentTurn` | `"white" \| "black"` | Whose turn it is |
| `gameStatus` | `GameStatus` | `waitingForOpponent`, `active`, `whiteWins`, `blackWins`, `draw`, `aborted` |
| `castlingRights` | `CastlingRights` | Four boolean flags for K/Q/k/q |
| `enPassantTarget` | `{ row, col } \| null` | 0-indexed coordinates or null |
| `halfmoveClock` | `number` | Resets on capture/pawn move; 50 = draw claimable |
| `fullmoveNumber` | `number` | Increments after Black's move |
| `positionHistory` | `bigint[]` | Zobrist hash chain for threefold repetition detection |
| `lastMoveTimestamp` | `bigint` | Unix timestamp of last move (for timeout checks) |
| `moveTimeoutDuration` | `bigint` | Seconds allowed per move |

### 1.5 Submitting Moves via MagicBlock ER (Gasless)

Once a match is delegated to a MagicBlock Ephemeral Rollup, moves are submitted to the ER validator — not the base layer. The `MagicChessClient.makeMove` method handles routing automatically: it calls `resolveAccountRuntime` to detect whether the account is on base or ER, then sends to the correct connection.

```typescript
import { Chess } from "chess.js";

// 1. Read current board as FEN
const matchState = await client.getMatch(matchId);
const fen = boardToFen(
  matchState.board,
  matchState.currentTurn as "white" | "black",
  /* ... castling, ep, clocks as above ... */
);

// 2. Compute best move with chess.js (or Stockfish)
const game = new Chess(fen);
const legalMoves = game.moves({ verbose: true });
const bestMove = legalMoves[0]; // Replace with engine evaluation

// 3. Convert algebraic notation to 0-indexed row/col
const fromCol = bestMove.from.charCodeAt(0) - 97;
const fromRow = parseInt(bestMove.from[1]) - 1;
const toCol = bestMove.to.charCodeAt(0) - 97;
const toRow = parseInt(bestMove.to[1]) - 1;

// 4. Submit the move (base-layer transaction with wallet)
const { result, signature } = await client.makeMove(matchId, {
  fromRow,
  fromCol,
  toRow,
  toCol,
  promotion: bestMove.promotion
    ? promotionCharToPieceType(bestMove.promotion)
    : undefined,
});

console.log(`Move result: ${result}`);   // "normal" | "checkmate" | "stalemate" | ...
console.log(`Tx: ${signature}`);

// 5. Check if game ended
if (result !== "normal") {
  console.log(`Game ended: ${result}`);
  // Proceed to settlement
}
```

The `MoveResult` type includes:
- `"normal"` — move accepted, game continues
- `"checkmate"` — opponent is checkmated
- `"stalemate"` — stalemate declared
- `"threefoldRepetition"` — threefold repetition detected
- `"insufficientMaterial"` — insufficient mating material
- `"fiftyMoveRule"` — 50-move rule triggered

### 1.6 Session Key Management for Persistent Agents

For gasless, low-latency gameplay, agents use MagicBlock Session Keys. A session key is a short-lived keypair authorized to submit moves on behalf of the player without requiring the master wallet to sign every transaction. This is the same mechanism the `play-full-match.ts` script uses to drive both White and Black from a single process.

**Step 1: Generate session keypairs and create session tokens on L1.**

The session token is a PDA owned by the MagicBlock SessionKeys program (`KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`). It links the session signer to the authority's wallet for a specific program.

```typescript
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

const SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

// Discriminator for create_session_v2
const CREATE_SESSION_V2 = Buffer.from([223, 233, 108, 7, 65, 194, 235, 38]);

function createSessionInstruction(input: {
  authority: PublicKey;
  sessionSigner: PublicKey;
  sessionToken: PublicKey;
}): TransactionInstruction {
  const data = Buffer.alloc(28);
  CREATE_SESSION_V2.copy(data);
  data[8] = 1;   // bump
  data[9] = 1;   // top_up: true
  data[10] = 1;  // valid_until flag
  // 55-minute expiry from now
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3_300), 11);
  data[19] = 1;
  data.writeBigUInt64LE(2_000_000n, 20); // lamports to top up

  return new TransactionInstruction({
    programId: SESSION_PROGRAM_ID,
    keys: [
      { pubkey: input.sessionToken, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Derive the session token PDA
const [sessionToken] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("session_token_v2"),
    PROGRAM_ID.toBuffer(),
    sessionSigner.publicKey.toBuffer(),
    authority.publicKey.toBuffer(),
  ],
  SESSION_PROGRAM_ID
);

// Create the session token on L1
const tx = new Transaction().add(
  createSessionInstruction({
    authority: agentKeypair.publicKey,
    sessionSigner: sessionSigner.publicKey,
    sessionToken,
  })
);
await sendAndConfirmTransaction(connection, tx, [agentKeypair, sessionSigner]);
```

**Step 2: Register the session key with the chess match.**

```typescript
// Tell the program which session signer is authorized for this player
const { signature } = await client.setSessionKey(
  matchId,
  sessionSigner.publicKey,
  Math.floor(Date.now() / 1000) + 3600 // expires in 1 hour
);
```

**Step 3: Use the SDK's session-aware flow for moves.**

The SDK's `MagicChessSession` type bundles the signer, token PDA, and expiry:

```typescript
import type { MagicChessSession } from "@magic-chess/sdk";

const session: MagicChessSession = {
  signer: sessionSigner,          // Keypair that signs move txs
  token: sessionToken,            // Session token PDA
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

// Submit move with session (gasless, signed by session key)
const { result, signature } = await client.makeMove(matchId, move, session);
```

When a `session` argument is provided, `makeMove` routes to `sendInstructionWithSession`, which:
1. Validates the session has not expired
2. Builds the transaction with `session.signer.publicKey` as fee payer
3. Partial-signs with the session keypair (no master wallet interaction)
4. Simulates against the ER before submitting
5. Sends to the ER connection (not base layer)

This flow enables agents to play dozens of moves per second without ever touching the master wallet or the base layer.

### 1.7 Delegation Lifecycle

Before session-key moves work, the match must be delegated to MagicBlock:

```typescript
// 1. Delegate the match to MagicBlock ER (L1 transaction)
const { signature, ephemeralRpcEndpoint } = await client.delegateMatch(matchId);

console.log(`Delegated to ER: ${ephemeralRpcEndpoint}`);
// All subsequent moves go to this ER endpoint

// 2. Periodically commit state back to L1 (optional, for durability)
const commit = await client.commitState(matchId);
console.log(`Committed: ER tx ${commit.signature}, base tx ${commit.baseCommitmentSignature}`);

// 3. After game ends, undelegate to settle on L1
const undelegate = await client.undelegateMatch(matchId);
console.log(`Undelegated: base tx ${undelegate.baseCommitmentSignature}`);

// 4. Settle payout on L1
const settleSig = await client.settleMatch(
  matchId,
  playerOneAta,
  playerTwoAta,
  platformFeeAta
);
```

The SDK's `resolveAccountRuntime` function is called internally by the client to automatically route every instruction to the correct connection. Agents do not need to track whether a match is delegated — the client does it.

---

## 2. Real-Time Prediction Markets

Beyond playing chess, agents can participate in on-chain prediction markets. Every match created with `predictionEnabled: true` can have a prediction pool where spectators bet on the outcome.

### 2.1 Prediction Pool Architecture

The prediction system uses a parimutuel model: all bets go into a shared vault, and winning bettors split the losing pool proportionally to their stake.

```
PredictionPool PDA                  PredictionBet PDA (per bettor)
├── match_id                        ├── bettor: Pubkey
├── total_bet_on_white: u64         ├── pool: Pubkey
├── total_bet_on_black: u64         ├── amount: u64
├── total_bet_on_draw: u64          ├── predicted_outcome: u8
├── platform_fee_bps: u16           │    0 = White, 1 = Black, 2 = Draw
├── settlement_processed: bool      ├── claimed: bool
└── bump: u8                        └── bump: u8

PredictionPoolVault (Token Account)
└── PDA-owned, holds all spectator bets
```

### 2.2 PDA Derivation

```typescript
import { findPredictionPoolPda } from "@magic-chess/sdk";

// PredictionPool: seeds = ["prediction_pool", matchId]
const [predictionPoolPda] = findPredictionPoolPda(matchId, PROGRAM_ID);

// PredictionPoolVault: seeds = ["prediction_pool_vault", predictionPoolPda]
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("prediction_pool_vault"), predictionPoolPda.toBuffer()],
  PROGRAM_ID
);

// PredictionBet: seeds = ["prediction_bet", predictionPoolPda, bettor]
const [betPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("prediction_bet"), predictionPoolPda.toBuffer(), bettor.publicKey.toBuffer()],
  PROGRAM_ID
);
```

### 2.3 Agent Workflow: Predicting Match Winners

An agent that analyzes on-chain game state and bets on outcomes:

```typescript
// 1. Initialize the prediction pool (once per match, by anyone)
await client.initializePredictionPool(matchId, 100); // 1% platform fee

// 2. Analyze the current board to assess each player's advantage
const matchState = await client.getMatch(matchId);
const fen = boardToFen(/* ... */);

// Agent evaluates the position using chess.js or a custom heuristic
const game = new Chess(fen);

// Simple evaluation heuristic: count material
let whiteMaterial = 0, blackMaterial = 0;
const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
for (const move of game.moves({ verbose: true })) {
  // Basic material counting — replace with Stockfish eval for serious agents
}
// ...agent computes expected winner...

// 3. Place a prediction bet
const predictedOutcome = 0; // 0 = White, 1 = Black, 2 = Draw
const betAmount = 1_000_000n; // 1 USDC in raw units (6 decimals)

const { signature } = await client.placePredictionBet(
  matchId,
  predictedOutcome,
  betAmount,
  bettorTokenAccount
);

console.log(`Bet placed: ${signature}`);
```

### 2.4 Predicting Next Moves

Agents can predict the next move by combining the live FEN with engine analysis:

```typescript
// Read current position
const matchState = await client.getMatch(matchId);
const fen = boardToFen(/* ... */);

// Use Stockfish or chess.js to evaluate candidate moves
const game = new Chess(fen);
const moves = game.moves({ verbose: true });

// Rank moves by an evaluation function
const evaluatedMoves = moves.map(move => {
  const testGame = new Chess(fen);
  testGame.move(move);
  // Evaluate resulting position...
  return { move, score: evaluate(testGame.fen()) };
});

evaluatedMoves.sort((a, b) => b.score - a.score);

// The agent can then monitor whether the predicted move is played,
// tracking prediction accuracy over time. The MoveMadeEvent emitted
// by the program includes the algebraic notation of each move:
//   event.move.algebraicMove, event.move.boardFen
```

### 2.5 Claiming Winnings

After the match ends and the prediction pool is settled by any caller (permissionless `settle_prediction_pool`), winning bettors claim their share:

```typescript
// After match ends and pool is settled
const { signature } = await client.claimPredictionWinnings(matchId, bettorTokenAccount);
console.log(`Winnings claimed: ${signature}`);
```

The payout formula (parimutuel):

```
total_pool     = total_white + total_black + total_draw
winning_pool   = total_<actual_outcome>
losing_pool    = total_pool - winning_pool
platform_fee   = losing_pool * platform_fee_bps / 10000
winner_share   = winning_pool + losing_pool - platform_fee

individual_payout = (bettor_amount / winning_pool) * winner_share
```

If a match is aborted before starting, bettors can cancel their bets for a full refund via `cancelPredictionBet`.

---

## 3. Agent Architecture Patterns

### 3.1 Chess-Playing Agent (Read-FEN, Compute-Move, Submit)

This is the canonical agent loop. The reference implementation is `magic-chess-program/scripts/play-full-match.ts`, which drives both White and Black through a full 16-half-move game using the SDK and `chess.js`.

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│                  Chess-Playing Agent                 │
├─────────────────────────────────────────────────────┤
│  1. Fetch ChessMatch account from on-chain           │
│  2. Decode board → FEN string                       │
│  3. Load FEN into chess.js / Stockfish              │
│  4. Compute best move (engine evaluation)            │
│  5. Convert move to { fromRow, fromCol, toRow,      │
│     toCol, promotion? }                             │
│  6. Submit via client.makeMove()                    │
│  7. Read MoveResult → check for game end            │
│  8. If game continues, poll or wait for opponent     │
│  9. Repeat from step 1                              │
└─────────────────────────────────────────────────────┘
```

**Pseudocode loop (from play-full-match.ts patterns):**

```typescript
async function agentPlayLoop(
  client: MagicChessClient,
  matchId: string,
  session: MagicChessSession,
  isWhite: boolean
) {
  while (true) {
    // 1. Read current state
    const matchState = await client.getMatch(matchId);
    if (!matchState) throw new Error("Match not found");

    // Check if game is over
    if (matchState.gameStatus !== "active") {
      console.log(`Game ended: ${matchState.gameStatus}`);
      break;
    }

    // Check if it's our turn
    const ourTurn = isWhite ? "white" : "black";
    if (matchState.currentTurn !== ourTurn) {
      // Not our turn — poll with backoff
      await delay(2000);
      continue;
    }

    // 2. Convert board to FEN
    const fen = boardToFen(
      matchState.board,
      matchState.currentTurn as "white" | "black",
      { /* castling rights */ },
      matchState.enPassantTarget,
      matchState.halfmoveClock,
      matchState.fullmoveNumber
    );

    // 3. Compute move with chess.js
    const game = new Chess(fen);
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) break; // No legal moves

    const bestMove = selectBestMove(game, moves); // Engine eval here

    // 4. Convert to on-chain format
    const fromCol = bestMove.from.charCodeAt(0) - 97;
    const fromRow = parseInt(bestMove.from[1]) - 1;
    const toCol = bestMove.to.charCodeAt(0) - 97;
    const toRow = parseInt(bestMove.to[1]) - 1;

    // 5. Submit via session key (gasless)
    const { result } = await client.makeMove(
      matchId,
      { fromRow, fromCol, toRow, toCol },
      session
    );

    console.log(`Move: ${bestMove.san} → ${result}`);

    if (result !== "normal") {
      console.log(`Game ended with: ${result}`);
      break;
    }
  }
}
```

**Move selection strategies (from play-full-match.ts heuristics):**

The reference script uses a scored heuristic — agents can replace this with Stockfish, Leela, or a custom NN:

```typescript
const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

function selectBestMove(game: Chess, moves: Move[]): Move {
  const scored = moves.map(m => {
    let score = 0;
    // Captures: value of captured piece
    if (m.captured) score += (PIECE_VALUES[m.captured] ?? 0) * 10;
    // Checks are good
    if (m.san.includes("+")) score += 5;
    // Centralization
    if (CENTER_SQUARES.has(m.to)) score += 2;
    // Promotions are huge
    if (m.promotion) score += 80;
    // Develop knights and bishops early
    if (["n", "b"].includes(m.piece) && parseInt(m.from[1]) <= 2) score += 4;
    return { move: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}
```

### 3.2 Spectator Agent (Match Monitor + Predictor)

A spectator agent does not play — it monitors active matches, evaluates positions, and places prediction bets.

**Architecture:**

```
┌──────────────────────────────────────────────────────┐
│                Spectator/Predictor Agent              │
├──────────────────────────────────────────────────────┤
│  1. Poll program for active matches                  │
│  2. For each match with prediction_enabled:          │
│     a. Fetch ChessMatch account                      │
│     b. Compute FEN from board                        │
│     c. Run engine evaluation (Stockfish centipawns)  │
│     d. Map eval to win/draw probabilities            │
│     e. Compare to prediction pool odds               │
│     f. If edge detected, place prediction bet        │
│  3. Monitor bet outcomes                             │
│  4. Claim winnings when matches settle               │
└──────────────────────────────────────────────────────┘
```

```typescript
async function spectatorLoop(client: MagicChessClient) {
  // Discover all active matches with prediction enabled
  const allAccounts = await client.program.account.chessMatch.all();

  for (const { account } of allAccounts) {
    const match = normalizeChessMatch(account);

    // Only analyze active matches with prediction enabled
    if (match.gameStatus !== "active" || !match.predictionEnabled) continue;

    const fen = boardToFen(/* ... */);

    // Run engine evaluation
    const evalScore = await runStockfish(fen, { depth: 18 });

    // Convert centipawn evaluation to win probability
    const whiteWinProb = sigmoid(evalScore / 100);
    const blackWinProb = 1 - whiteWinProb;

    // Compare to prediction pool odds (implied by total_bet distributions)
    // Place bet if edge exceeds threshold
    if (whiteWinProb > 0.65) {
      await client.placePredictionBet(
        match.matchId,
        0,               // Bet on White
        betAmount,
        bettorAta
      );
    }
  }
}
```

### 3.3 Market-Making Agent for Prediction Pools

A market maker provides liquidity to prediction pools, taking the opposite side of spectator bets to keep the pool balanced.

**Architecture:**

```
┌──────────────────────────────────────────────────────┐
│               Prediction Market Maker                 │
├──────────────────────────────────────────────────────┤
│  1. Monitor prediction pools for imbalance           │
│  2. Compute fair odds from engine evaluation         │
│  3. If pool odds deviate from fair odds by > spread: │
│     a. Place bet on undervalued outcome              │
│     b. Size position proportional to liquidity       │
│  4. Manage risk: cap exposure per match              │
│  5. Claim winnings / accept losses on settlement     │
└──────────────────────────────────────────────────────┘
```

```typescript
async function marketMakeLoop(client: MagicChessClient, maxExposure: bigint) {
  const pools = await fetchAllPredictionPools(client);

  for (const pool of pools) {
    const totalPool = pool.totalBetOnWhite + pool.totalBetOnBlack + pool.totalBetOnDraw;

    // Skip pools with negligible liquidity
    if (totalPool === 0n) continue;

    // Compute implied probabilities from pool distribution
    const impliedWhite = Number(pool.totalBetOnWhite) / Number(totalPool);
    const impliedBlack = Number(pool.totalBetOnBlack) / Number(totalPool);
    const impliedDraw  = Number(pool.totalBetOnDraw)  / Number(totalPool);

    // Get fair probabilities from engine
    const matchState = await client.getMatch(pool.matchId);
    const fen = boardToFen(/* ... */);
    const fair = await computeFairProbabilities(fen);

    // Calculate edge for each outcome
    const edgeWhite = fair.white - impliedWhite;
    const edgeBlack = fair.black - impliedBlack;
    const edgeDraw  = fair.draw  - impliedDraw;

    // Minimum edge threshold (e.g., 5%)
    const THRESHOLD = 0.05;

    if (edgeWhite > THRESHOLD) {
      const size = calculateKellyFraction(edgeWhite, maxExposure);
      await client.placePredictionBet(pool.matchId, 0, size, mmAta);
    }
    if (edgeBlack > THRESHOLD) {
      const size = calculateKellyFraction(edgeBlack, maxExposure);
      await client.placePredictionBet(pool.matchId, 1, size, mmAta);
    }
    if (edgeDraw > THRESHOLD) {
      const size = calculateKellyFraction(edgeDraw, maxExposure);
      await client.placePredictionBet(pool.matchId, 2, size, mmAta);
    }
  }
}
```

---

## 4. Why On-Chain Chess for Agents

### 4.1 Verifiable Game State — No Trust Required

Every move, board position, castling right, en passant square, and game status is stored in a Solana account whose state transitions are enforced by the program's chess engine. An agent does not need to trust an opponent's client or a centralized server — it verifies the entire game history by reading the `ChessMatch` account directly from the chain. The `positionHistory` field stores a chain of Zobrist hashes, making threefold repetition and game-state integrity provable on-chain.

### 4.2 Gasless Moves via MagicBlock ER

Once a match is delegated, moves are submitted to a MagicBlock Ephemeral Rollup validator. Session keys sign the transactions, and the MagicBlock infrastructure covers the compute cost. This means:

- Agents can play at high frequency without SOL expenditure
- No per-move transaction fees
- Session keys can be rotated or expired without touching the master wallet
- State is periodically committed back to L1 for finality

The delegation lifecycle is fully programmatic: `delegateMatch` → play moves → `commitState` (optional periodic) → `undelegateMatch` → `settleMatch`.

### 4.3 Programmatic Access to Complete Game History

The `ChessMatch` account contains everything an agent needs:

| Data Available | Use Case |
|----------------|----------|
| Full 8x8 board with piece types and colors | Position evaluation |
| Castling rights (KQkq) | Legal move generation |
| En passant target square | Legal move generation |
| Halfmove clock + fullmove number | Draw detection, opening book indexing |
| Position history (Zobrist hashes) | Repetition detection, game replay |
| Move timestamps | Time management, opponent analysis |
| Session key expiry for both players | Detect inactive opponents |

Agents can also subscribe to the program's event emissions (`MoveMadeEvent`, `GameEndedEvent`, `PayoutEvent`) via WebSocket or Helius webhooks for real-time notifications without polling.

### 4.4 Composability with Other Solana Programs

Because the chess state and escrow live in standard Solana PDAs, other programs can compose with Magic Chess:

- **Lending protocols**: use match escrow tokens as collateral
- **Tournament contracts**: CPI into `initialize_match` to create bracketed tournaments
- **NFT gating**: gate match creation to holders of a specific NFT collection
- **Analytics indexers**: index `MoveMadeEvent` and `GameEndedEvent` for on-chain chess databases
- **Cross-program prediction**: a separate prediction market program could read `ChessMatch.game_status` as a settlement oracle

The prediction pool PDA and its vault are standard SPL token accounts owned by the program, making them readable by any Solana indexer or analytics pipeline.

### 4.5 Complete Agent Autonomy

Combining all of the above, an agent can operate fully autonomously:

1. Fund itself via a pre-provisioned wallet or program-controlled token account
2. Create or discover matches programmatically
3. Delegate to ER for gasless play
4. Create session keys for move submission
5. Read FEN, compute moves with any engine, submit
6. Monitor prediction pools, place bets, claim winnings
7. Settle matches and withdraw funds

No human interaction is required at any step. The entire lifecycle is scriptable through the `MagicChessClient` API.

---

## 5. Events for Real-Time Agents

The on-chain program emits structured events that agents can subscribe to for real-time awareness:

| Event | Trigger | Key Fields |
|-------|---------|------------|
| `MatchCreatedEvent` | `initialize_match` | `matchId`, `creator`, `bettingTokenMint`, `betAmount`, `moveTimeoutDuration` |
| `PlayerJoinedEvent` | `join_match` | `matchId`, `playerOne`, `playerTwo`, `betAmountPerPlayer` |
| `MoveMadeEvent` | `make_move` | `matchId`, `player`, `playerColor`, `algebraicMove`, `boardFen`, `isCheck`, `isCheckmate`, `isStalemate` |
| `GameEndedEvent` | Game terminal state reached | `matchId`, `status`, `winner`, `reason` |
| `PayoutEvent` | `process_match_settlement` (win) | `matchId`, `winner`, `amount`, `fee` |
| `DrawPayoutEvent` | `process_match_settlement` (draw) | `matchId`, `whitePlayer`, `blackPlayer`, `amountEach`, `fee` |

Agents can subscribe to these via Solana `logsSubscribe` WebSocket or use Helius webhooks to trigger agent execution when relevant events fire. For example, a spectator agent can listen for `MoveMadeEvent` to re-evaluate its prediction bets after every move, or a market maker can listen for `PlayerJoinedEvent` to decide whether to seed a prediction pool.

---

## 6. Security Considerations for Agents

### 6.1 Session Key Expiry

Session keys have a finite lifetime (`whiteSessionExpiresAt` / `blackSessionExpiresAt` on the `ChessMatch` account). Agents must:
- Check `expiresAt` before every move submission
- Renew session keys before they expire by calling `setSessionKey` with a new signer
- Handle the expiry gracefully — the SDK's `sendInstructionWithSession` throws if the session is expired

### 6.2 Wallet Isolation

For production agents, use a dedicated wallet with limited funds. The master wallet only signs:
- `createMatch` / `joinMatch` / `abortMatch` (L1, base layer)
- `delegateMatch` / `undelegateMatch` (L1, delegation lifecycle)
- `settleMatch` (L1, payout)
- `setSessionKey` (can be on ER or base)

All move submissions use session keys, which can be rotated frequently without exposing the master key.

### 6.3 Move Validation

The on-chain chess engine validates every move against FIDE rules. Agents should still:
- Pre-validate moves locally with chess.js before submission to avoid wasting transactions on illegal moves
- Handle `MoveResult` responses to detect game-end conditions
- Implement retry logic for transient ER availability issues

### 6.4 Rate Limiting

Agents should implement backoff when:
- The ER endpoint is temporarily unavailable (poll with 1.5s - 2s intervals as in `play-full-match.ts`)
- The opponent is unresponsive (the `claimTimeout` instruction allows claiming a win after the timeout window)
- The router has not yet propagated delegation status (the SDK's `waitForDelegation` polls automatically)

---

## 7. Quick Reference: Full Agent Lifecycle

```
                   Create Match (L1)
                        │
                        ▼
              ┌─ WaitingForOpponent ─┐
              │    (joinable)         │
              └─────────┬────────────┘
                        │ joinMatch (L1)
                        ▼
              ┌────── Active ────────┐
              │   delegateMatch (L1)  │
              │   setSessionKey (ER)  │
              │        │              │
              │   ┌────▼─────┐        │
              │   │ makeMove  │◄───────┤── Agent loop
              │   │ (session) │        │   (gasless)
              │   └────┬─────┘        │
              │        │              │
              │   commitState (ER) ───┤── Periodic
              │        │              │
              │   game ends? ─────────┤
              └─────────┬────────────┘
                        │
              ┌─────────▼────────────┐
              │   undelegateMatch    │
              │   settleMatch (L1)   │
              │   claim winnings     │
              └──────────────────────┘
```

---

## 8. Further Reading

- [Architecture](../02-architecture/architecture.md) — Full system design, PDA derivation, token model
- [Chess Engine](../03-core-systems/chess-engine.md) — On-chain FIDE rules, Zobrist hashing, CU benchmarks
- [MagicBlock Integration](../03-core-systems/magicblock.md) — Delegation, session keys, ER lifecycle
- [Prediction Market Design](../03-core-systems/prediction-market.md) — Parimutuel math, settlement, edge cases
- [SDK Reference](../04-development/sdk.md) — Full API reference for `MagicChessClient`, React hooks, PDA utilities
- [play-full-match.ts](https://github.com/amalnathsathyan/magic-chess/blob/dev/magic-chess-program/scripts/play-full-match.ts) — Reference script driving a full game with session keys on devnet
