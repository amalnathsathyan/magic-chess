# TypeScript SDK

`@magic-chess/sdk` is the official TypeScript SDK for Magic Chess. It provides a typed client, React hooks, FEN utilities, PDA helpers, and MagicBlock integration — everything needed to build a Magic Chess frontend.

## Installation

```bash
npm install @magic-chess/sdk
```

Peer dependencies:
- `@anchor-lang/core` >= 1.0.0
- `@magicblock-labs/ephemeral-rollups-kit` >= 0.6.0
- `@solana/web3.js` >= 2.0.0

## Quick Start

```typescript
import { MagicChessClient, findChessMatchPda } from "@magic-chess/sdk";
import { AnchorWallet, Program } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = getAnchorWallet(); // your AnchorWallet instance

// 1. Create the program + client
const client = new MagicChessClient(program, wallet);

// 2. Create a match
const { match } = await client.createMatch({
  matchId: "match-001",
  betAmount: 100_000_000, // 0.1 tokens (raw units)
  moveTimeoutDuration: 180,
  platformFeeBasisPoints: 250, // 2.5%
  platformFeeWallet: new PublicKey("..."),
  bettingTokenMint: new PublicKey("..."),
  playerTokenAccount: new PublicKey("..."),
});

// 3. Player 2 joins
await client.joinMatch({
  matchId: "match-001",
  betAmount: 100_000_000,
  playerTokenAccount: new PublicKey("..."),
});

// 4. Make a move (e4)
const { result } = await client.makeMove("match-001", {
  fromRow: 1, fromCol: 4, toRow: 3, toCol: 4,
});

// 5. Fetch match state
const state = await client.getMatch("match-001");
console.log(state.gameStatus); // "active"

// 6. Settle after game ends
await client.settleMatch("match-001", p1Ata, p2Ata, feeAta);
```

## MagicChessClient API

The `MagicChessClient` wraps `@anchor-lang/core`'s `Program<MagicChess>`. All transaction methods submit to the network immediately via `.rpc()`.

### Constructor

```typescript
new MagicChessClient(program: Program<MagicChess>, wallet?: AnchorWallet)
```

| Param | Type | Description |
|-------|------|-------------|
| `program` | `Program<MagicChess>` | Anchor program instance (network, provider, IDL) |
| `wallet` | `AnchorWallet \| undefined` | Wallet for signing transactions |

### Match Lifecycle

#### `createMatch(params)`

Creates a new chess match as Player 1 (White). Transfers the bet amount from Player 1's token account into the match escrow PDA.

```typescript
createMatch(params: CreateMatchParams): Promise<{ match: string; signature: TransactionSignature }>
```

**CreateMatchParams:**

| Field | Type | Description |
|-------|------|-------------|
| `matchId` | `string` | Unique match identifier (max 32 bytes) |
| `betAmount` | `number` | Bet in raw token units (minimum 1) |
| `moveTimeoutDuration` | `number` | Seconds allowed per move (0 = no timeout) |
| `platformFeeBasisPoints` | `number` | Platform fee in basis points (max 10000) |
| `platformFeeWallet` | `PublicKey` | Wallet receiving platform fees |
| `bettingTokenMint` | `PublicKey` | SPL token mint for the wager |
| `playerTokenAccount` | `PublicKey` | Player 1's ATA for the betting mint |

Returns: `{ match: string, signature: TransactionSignature }`

#### `joinMatch(params)`

Joins an existing match as Player 2 (Black). Matches the bet amount and transfers tokens to escrow.

```typescript
joinMatch(params: JoinMatchParams): Promise<{ signature: TransactionSignature }>
```

**JoinMatchParams:**

| Field | Type | Description |
|-------|------|-------------|
| `matchId` | `string` | Match to join |
| `betAmount` | `number` | Must match creator's bet |
| `playerTokenAccount` | `PublicKey` | Player 2's ATA for the match's token |

#### `abortMatch(matchId)`

Not yet implemented on-chain. Throws an error with a pointer to the design document.

```typescript
abortMatch(matchId: string): Promise<{ signature: TransactionSignature }>
```

### Gameplay

#### `makeMove(matchId, move)`

Executes a chess move. Fetches the match state after the transaction to determine the result.

```typescript
makeMove(matchId: string, move: Move): Promise<{ result: MoveResult; signature: TransactionSignature }>
```

**Move:**

| Field | Type | Description |
|-------|------|-------------|
| `fromRow` | `number` | 0-indexed row (0 = rank 1) |
| `fromCol` | `number` | 0-indexed column (0 = a-file) |
| `toRow` | `number` | Destination row |
| `toCol` | `number` | Destination column |
| `promotion?` | `PieceType` | Promotion piece type (Pawn, Knight, Bishop, Rook, Queen) |

**MoveResult values:** `"normal"`, `"checkmate"`, `"stalemate"`, `"threefoldRepetition"`

#### `resign(matchId)`

Resigns from the current game. The opponent wins.

```typescript
resign(matchId: string): Promise<{ signature: TransactionSignature }>
```

#### `claimTimeout(matchId)`

Claims a win when the opponent has exceeded the per-move timeout.

```typescript
claimTimeout(matchId: string): Promise<{ signature: TransactionSignature }>
```

### Settlement

#### `settleMatch(matchId, playerOneAta, playerTwoAta, platformFeeAta)`

Processes payout distribution after a game concludes. Can be called by anyone.

```typescript
settleMatch(
  matchId: string,
  playerOneAta: PublicKey,
  playerTwoAta: PublicKey,
  platformFeeAta: PublicKey
): Promise<{ signature: TransactionSignature }>
```

### Queries

#### `getMatch(matchId)`

Fetches the full `ChessMatch` account by match ID. Returns `null` if the account does not exist.

```typescript
getMatch(matchId: string): Promise<ChessMatch | null>
```

#### `listJoinableMatches(filters?)`

Lists matches with `WaitingForOpponent` status. Optionally filters by betting token mint.

```typescript
listJoinableMatches(filters?: { mint?: PublicKey }): Promise<MatchInfo[]>
```

#### `getPlayerMatches(player)`

Lists all matches where the given player is Player 1 or Player 2.

```typescript
getPlayerMatches(player: PublicKey): Promise<MatchInfo[]>
```

## React Hooks

Import from `@magic-chess/sdk/react`.

### MagicChessProvider

Context provider that makes `MagicChessClient` available to child hooks.

```tsx
import { MagicChessProvider } from "@magic-chess/sdk/react";

function App() {
  return (
    <MagicChessProvider program={program} wallet={wallet}>
      <MatchViewer />
    </MagicChessProvider>
  );
}
```

| Prop | Type | Description |
|------|------|-------------|
| `program` | `Program<MagicChess>` | Anchor program instance |
| `wallet` | `AnchorWallet \| undefined` | Wallet for signing |
| `children` | `ReactNode` | Child components |

### useMatch

Fetch a single match by ID with loading, error, and refetch support.

```tsx
const { match, loading, error, refetch } = useMatch("match-001");
```

| Return | Type | Description |
|--------|------|-------------|
| `match` | `ChessMatch \| null` | The fetched match account |
| `loading` | `boolean` | True while fetching |
| `error` | `Error \| null` | Error if fetch failed |
| `refetch` | `() => Promise<void>` | Manual refetch trigger |

### useMatches

Fetch all joinable matches, optionally filtered by mint.

```tsx
const { matches, loading, error } = useMatches({ mint: usdcMint });
```

### usePlayerMatches

Fetch all matches for a specific player.

```tsx
const { matches, loading, error } = usePlayerMatches(playerPubkey);
```

### useMatchEvents

Subscribe to real-time events for a match. Returns a cleanup function.

```tsx
const cleanup = useMatchEvents("match-001", {
  onMoveMade: (event) => console.log("Move:", event.algebraicMove),
  onGameEnded: (event) => console.log("Game over:", event.reason),
  onPlayerJoined: (event) => console.log("Joined:", event.playerTwo),
});

// When done:
cleanup();
```

> **Note:** Event streaming depends on the Anchor provider's connection. For production, consider Helius webhooks or a WebSocket relay.

### useMagicChessClient

Get the `MagicChessClient` from context, or create one from the given `program` + `wallet`.

```typescript
const client = useMagicChessClient(program, wallet);
```

## FEN Utilities

Import from `@magic-chess/sdk/utils/fen`. Mirrors the on-chain `generate_fen()` in `chess_logic.rs`.

### `boardToFen()`

Converts the on-chain board representation to a standard FEN string.

```typescript
boardToFen(
  board: (Piece | null)[][],
  currentTurn: 'white' | 'black',
  castlingRights: CastlingRights,
  enPassantTarget: EnPassantSquare | null,
  halfmoveClock: number,
  fullmoveNumber: number,
): string
```

**Example:**

```typescript
import { boardToFen } from "@magic-chess/sdk/utils/fen";

// Starting position
const fen = boardToFen(startBoard, "white", {
  whiteKingside: true, whiteQueenside: true,
  blackKingside: true, blackQueenside: true,
}, null, 0, 1);

console.log(fen);
// "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

**Board layout:** `board[row][col]` where row 0 = rank 1 (White's back rank) and col 0 = a-file. FEN output follows standard 6-field format.

### `fenToBoard()`

Parses a FEN string into the on-chain board representation.

```typescript
fenToBoard(fen: string): FenState
```

**FenState:**

```typescript
interface FenState {
  board: (Piece | null)[][];
  currentTurn: 'white' | 'black';
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}
```

**Example:**

```typescript
import { fenToBoard } from "@magic-chess/sdk/utils/fen";

const state = fenToBoard("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
console.log(state.currentTurn); // "white"
console.log(state.board[0][4]); // { pieceType: "King", color: "White" }
```

The halfmove clock and fullmove number fields are optional (default to 0 and 1) to support simplified FEN formats.

## PDA Helpers

Derive program-derived addresses for chess match accounts.

### `findChessMatchPda(matchId, programId)`

```typescript
findChessMatchPda(matchId: string, programId: PublicKey): [PublicKey, number]
```

Seeds: `["chess_match", matchId]`. Returns the PDA and bump.

### `findMatchEscrowPda(matchId, programId)`

```typescript
findMatchEscrowPda(matchId: string, programId: PublicKey): [PublicKey, number]
```

Seeds: `["match_escrow", matchId]`. Returns the PDA and bump.

### `findPredictionPoolPda(matchId, programId)`

```typescript
findPredictionPoolPda(matchId: string, programId: PublicKey): [PublicKey, number]
```

Seeds: `["prediction_pool", matchId]`. Reserved for future prediction market functionality.

## MagicBlock Helpers

Import from `@magic-chess/sdk`.

### Constants

```typescript
MAGICBLOCK_DEVNET_RPC    // "https://rpc.magicblock.app/devnet"
MAGICBLOCK_DEVNET_ROUTER // "https://devnet-router.magicblock.app/"
DELEGATION_PROGRAM_ID    // PublicKey
MAGIC_PROGRAM_ID         // PublicKey (Magic111...)
MAGIC_CONTEXT_ID         // PublicKey (MagicContext111...)
```

### `getDelegationStatus(account)`

Queries the MagicBlock router for an account's delegation status.

```typescript
getDelegationStatus(account: PublicKey): Promise<DelegationStatus>
```

**DelegationStatus:** `{ delegated: boolean; fqdn: string; owner: string }`

### `getERConnection(fqdn)`

Creates a Solana `Connection` pointed at an Ephemeral Rollup validator.

```typescript
getERConnection(fqdn: string): Connection
```

## Error Handling

### Transaction errors

All client methods throw on transaction failure. Anchor errors include a numeric error code and log messages.

```typescript
try {
  await client.makeMove("match-001", move);
} catch (err: any) {
  // Anchor errors have error.errorCode, error.error.errorCode
  console.error(err.logs?.join("\n"));
}
```

### Account not found

`getMatch()` catches not-found and returns `null` (no throw). Other queries throw on fetch failure.

### React hook errors

All hooks expose an `error: Error | null` field. Loading state is tracked separately in `loading: boolean`.

## Full Flow Example

### Create -> Join -> Move -> Settle

```typescript
import { MagicChessClient, findChessMatchPda, findMatchEscrowPda } from "@magic-chess/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";

async function fullMatchFlow(client: MagicChessClient) {
  const matchId = "quick-match";

  // Step 1: Create match
  await client.createMatch({
    matchId,
    betAmount: 50_000_000,          // 0.05 tokens
    moveTimeoutDuration: 300,       // 5 minutes per move
    platformFeeBasisPoints: 100,    // 1% fee
    platformFeeWallet: new PublicKey("..."),
    bettingTokenMint: usdcMint,
    playerTokenAccount: p1Ata,
  });
  console.log("Match created. Status: WaitingForOpponent");

  // Step 2: Player 2 joins
  await client.joinMatch({
    matchId,
    betAmount: 50_000_000,
    playerTokenAccount: p2Ata,
  });
  console.log("Player 2 joined. Status: Active");

  // Step 3: Make moves (Scholar's Mate: e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#)
  await client.makeMove(matchId, { fromRow: 1, fromCol: 4, toRow: 3, toCol: 4 }); // e4
  await client.makeMove(matchId, { fromRow: 6, fromCol: 4, toRow: 4, toCol: 4 }); // e5
  await client.makeMove(matchId, { fromRow: 0, fromCol: 3, toRow: 4, toCol: 7 }); // Qh5
  await client.makeMove(matchId, { fromRow: 7, fromCol: 1, toRow: 5, toCol: 2 }); // Nc6
  await client.makeMove(matchId, { fromRow: 0, fromCol: 5, toRow: 4, toCol: 2 }); // Bc4
  await client.makeMove(matchId, { fromRow: 7, fromCol: 6, toRow: 5, toCol: 5 }); // Nf6
  const { result } = await client.makeMove(matchId, { fromRow: 4, fromCol: 7, toRow: 6, fromCol: 5 }); // Qxf7#

  console.log(`Game over: ${result}`); // "checkmate"

  // Step 4: Settle
  await client.settleMatch(matchId, p1Ata, p2Ata, feeAta);
  console.log("Payout distributed. Winner receives pot minus fee.");
}
```

## Types Reference

### Enums

| Enum | Values |
|------|--------|
| `PieceType` | `Pawn`, `Knight`, `Bishop`, `Rook`, `Queen`, `King` |
| `PlayerColor` | `White`, `Black` |
| `GameStatus` | `WaitingForOpponent`, `Active`, `WhiteWins`, `BlackWins`, `Draw` |
| `GameEndReason` | `Checkmate`, `Stalemate`, `Resignation`, `Timeout`, `FiftyMoveRule`, `ThreefoldRepetition` |
| `MoveResult` | `Normal`, `Checkmate`, `Stalemate`, `ThreefoldRepetition` |

### Event Types

| Event | Key Fields |
|-------|------------|
| `MatchCreatedEvent` | matchId, creator, bettingTokenMint, betAmount, platformFeeBasisPoints |
| `PlayerJoinedEvent` | matchId, playerOne, playerTwo, bettingTokenMint, betAmountPerPlayer |
| `MoveMadeEvent` | matchId, player, algebraicMove, from/to coordinates, promotionPiece, boardFen, isCheck, isCheckmate |
| `GameEndedEvent` | matchId, status, winner, reason |
| `PayoutEvent` | matchId, winner, amount, fee |
| `DrawPayoutEvent` | matchId, whitePlayer, blackPlayer, amountEach, fee |
