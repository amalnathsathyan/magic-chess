# Magic Speed Chess -- Off-Chain FEN Integration & Complete Backend Design

## Table of Contents

1. [Coordinate System & FEN Mapping](#1-coordinate-system--fen-mapping)
2. [FEN Utility Functions (TypeScript)](#2-fen-utility-functions-typescript)
3. [Database Schema](#3-database-schema)
4. [Helius Webhook Handler](#4-helius-webhook-handler)
5. [FEN Integration Strategy (Option C)](#5-fen-integration-strategy-option-c)
6. [API Endpoints](#6-api-endpoints)
7. [PGN Export Design](#7-pgn-export-design)
8. [Redis Caching Strategy](#8-redis-caching-strategy)
9. [Crank Worker Design](#9-crank-worker-design)
10. [SDK Chess Utilities](#10-sdk-chess-utilities)
11. [Shared Package Strategy](#11-shared-package-strategy)

---

## 1. Coordinate System & FEN Mapping

### Board Indexing

The Solana program stores the chess board as `[[Option<Piece>; 8]; 8]`:
- `board[row][col]` where both indices are 0..7
- **Row 0** = rank 1 (White's back rank: a1 through h1)
- **Row 7** = rank 8 (Black's back rank: a8 through h8)
- **Col 0** = file 'a', **Col 7** = file 'h'

### FEN Iteration Direction

FEN describes ranks from **8 down to 1**, which maps to rows **7 down to 0**.

```
FEN rank 8 -> row 7 (Black's back rank)
FEN rank 7 -> row 6
...
FEN rank 2 -> row 1
FEN rank 1 -> row 0 (White's back rank)
```

### Piece Character Mapping

| Piece Type | White (uppercase) | Black (lowercase) |
|-----------|-------------------|-------------------|
| King      | K                 | k                 |
| Queen     | Q                 | q                 |
| Rook      | R                 | r                 |
| Bishop    | B                 | b                 |
| Knight    | N                 | n                 |
| Pawn      | P                 | p                 |

### Full FEN Format

```
{piece_placement} {active_color} {castling} {en_passant} {halfmove_clock} {fullmove_number}
```

Example starting position:
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

---

## 2. FEN Utility Functions (TypeScript)

These functions live in **two identical copies** (see Section 11 for shared-package discussion):

- `sdk/src/utils/chess.ts` -- frontend / SDK usage
- `backend/src/utils/fen.ts` -- server-side usage

### 2.1 Type Definitions

```typescript
// Mirrors the on-chain PieceType and PlayerColor enums
enum PieceType {
  Pawn = 0,
  Knight = 1,
  Bishop = 2,
  Rook = 3,
  Queen = 4,
  King = 5,
}

enum PlayerColor {
  White = 0,
  Black = 1,
}

interface Piece {
  pieceType: PieceType;
  color: PlayerColor;
}

interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

interface EnPassantSquare {
  row: number; // 0-7
  col: number; // 0-7
}

interface ChessPosition {
  board: (Piece | null)[][];            // [row][col], 8x8
  currentTurn: PlayerColor;
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

// FEN-specific type (string-based, more ergonomic for consumers)
interface FenPosition {
  board: (Piece | null)[][];
  currentTurn: 'w' | 'b';
  castlingRights: string;    // e.g., "KQkq", "Kq", "-"
  enPassantTarget: string | null; // e.g., "e3", null
  halfmoveClock: number;
  fullmoveNumber: number;
}
```

### 2.2 `boardToFen(position: ChessPosition): string`

```typescript
const PIECE_TO_FEN_CHAR: Record<PieceType, { white: string; black: string }> = {
  [PieceType.King]:   { white: 'K', black: 'k' },
  [PieceType.Queen]:  { white: 'Q', black: 'q' },
  [PieceType.Rook]:   { white: 'R', black: 'r' },
  [PieceType.Bishop]: { white: 'B', black: 'b' },
  [PieceType.Knight]: { white: 'N', black: 'n' },
  [PieceType.Pawn]:   { white: 'P', black: 'p' },
};

/**
 * Serialize a ChessPosition into a FEN string.
 *
 * Rows are iterated from 7 down to 0 (rank 8 -> rank 1 in FEN).
 * Empty squares are counted and encoded as digits.
 */
function boardToFen(position: ChessPosition): string {
  // --- 1. Piece Placement ---
  const ranks: string[] = [];

  for (let row = 7; row >= 0; row--) {
    let rankStr = '';
    let emptyCount = 0;

    for (let col = 0; col < 8; col++) {
      const piece = position.board[row][col];

      if (piece === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount.toString();
          emptyCount = 0;
        }
        rankStr += PIECE_TO_FEN_CHAR[piece.pieceType][
          piece.color === PlayerColor.White ? 'white' : 'black'
        ];
      }
    }

    if (emptyCount > 0) {
      rankStr += emptyCount.toString();
    }

    ranks.push(rankStr);
  }

  const piecePlacement = ranks.join('/');

  // --- 2. Active Color ---
  const activeColor = position.currentTurn === PlayerColor.White ? 'w' : 'b';

  // --- 3. Castling Availability ---
  let castling = '';
  if (position.castlingRights.whiteKingside)  castling += 'K';
  if (position.castlingRights.whiteQueenside) castling += 'Q';
  if (position.castlingRights.blackKingside)  castling += 'k';
  if (position.castlingRights.blackQueenside) castling += 'q';
  if (castling === '') castling = '-';

  // --- 4. En Passant Target ---
  let enPassant = '-';
  if (position.enPassantTarget !== null) {
    const file = String.fromCharCode('a'.charCodeAt(0) + position.enPassantTarget.col);
    const rank = (position.enPassantTarget.row + 1).toString(); // row 0 = rank 1
    enPassant = `${file}${rank}`;
  }

  // --- 5. Halfmove Clock ---
  const halfmove = position.halfmoveClock;

  // --- 6. Fullmove Number ---
  const fullmove = position.fullmoveNumber;

  return `${piecePlacement} ${activeColor} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
}
```

### 2.3 `fenToBoard(fen: string): ChessPosition`

```typescript
const FEN_CHAR_TO_PIECE: Record<string, { pieceType: PieceType; color: PlayerColor }> = {
  'K': { pieceType: PieceType.King,   color: PlayerColor.White },
  'Q': { pieceType: PieceType.Queen,  color: PlayerColor.White },
  'R': { pieceType: PieceType.Rook,   color: PlayerColor.White },
  'B': { pieceType: PieceType.Bishop, color: PlayerColor.White },
  'N': { pieceType: PieceType.Knight, color: PlayerColor.White },
  'P': { pieceType: PieceType.Pawn,   color: PlayerColor.White },
  'k': { pieceType: PieceType.King,   color: PlayerColor.Black },
  'q': { pieceType: PieceType.Queen,  color: PlayerColor.Black },
  'r': { pieceType: PieceType.Rook,   color: PlayerColor.Black },
  'b': { pieceType: PieceType.Bishop, color: PlayerColor.Black },
  'n': { pieceType: PieceType.Knight, color: PlayerColor.Black },
  'p': { pieceType: PieceType.Pawn,   color: PlayerColor.Black },
};

const FEN_REGEX = /^
  ( [rnbqkpRNBQKP1-8]{1,8} \/
    (?:[rnbqkpRNBQKP1-8]{1,8}\/){6}
    [rnbqkpRNBQKP1-8]{1,8} )
  \s+
  ([wb])
  \s+
  (K?Q?k?q?|-)
  \s+
  ([a-h][1-8]|-)
  \s+
  (\d+)
  \s+
  (\d+)
$/x;

/**
 * Parse a FEN string into a ChessPosition.
 * Throws on invalid FEN syntax.
 */
function fenToBoard(fen: string): ChessPosition {
  const trimmed = fen.trim();
  const match = trimmed.match(FEN_REGEX);

  if (!match) {
    throw new Error(`Invalid FEN string: "${trimmed}"`);
  }

  const [, piecePlacement, activeColor, castlingStr, enPassantStr,
         halfmoveStr, fullmoveStr] = match;

  // --- 1. Parse Piece Placement ---
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );

  const rankStrings = piecePlacement.split('/');
  // FEN rank 8 (index 0) -> board row 7
  // FEN rank 1 (index 7) -> board row 0

  for (let fenRankIdx = 0; fenRankIdx < 8; fenRankIdx++) {
    const boardRow = 7 - fenRankIdx; // Map FEN rank index to board row
    const rankStr = rankStrings[fenRankIdx];
    let boardCol = 0;

    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        boardCol += parseInt(ch, 10);
      } else {
        const pieceDef = FEN_CHAR_TO_PIECE[ch];
        if (!pieceDef) {
          throw new Error(`Unknown piece character in FEN: "${ch}"`);
        }
        board[boardRow][boardCol] = {
          pieceType: pieceDef.pieceType,
          color: pieceDef.color,
        };
        boardCol++;
      }
    }

    if (boardCol !== 8) {
      throw new Error(
        `FEN rank "${rankStr}" does not contain 8 files (got ${boardCol})`
      );
    }
  }

  // --- 2. Active Color ---
  const currentTurn =
    activeColor === 'w' ? PlayerColor.White : PlayerColor.Black;

  // --- 3. Castling Rights ---
  const castlingRights: CastlingRights = {
    whiteKingside:  castlingStr.includes('K'),
    whiteQueenside: castlingStr.includes('Q'),
    blackKingside:  castlingStr.includes('k'),
    blackQueenside: castlingStr.includes('q'),
  };

  // --- 4. En Passant Target ---
  let enPassantTarget: EnPassantSquare | null = null;
  if (enPassantStr !== '-') {
    const col = enPassantStr.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const row = parseInt(enPassantStr[1], 10) - 1;               // rank 1 -> row 0
    enPassantTarget = { row, col };
  }

  // --- 5 & 6. Clocks ---
  const halfmoveClock = parseInt(halfmoveStr, 10);
  const fullmoveNumber = parseInt(fullmoveStr, 10);

  return {
    board,
    currentTurn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}
```

### 2.4 `fenToFenPosition(fen: string): FenPosition`

A convenience variant that keeps the string-based fields (no enum conversions), for use in JSON API responses where consumers don't need the Rust-matching types:

```typescript
function fenToFenPosition(fen: string): FenPosition {
  const pos = fenToBoard(fen); // Uses the full parser above

  // Rebuild board as-is (same structure)
  const board: (Piece | null)[][] = pos.board;

  // Castling string from the original parse
  const parts = fen.trim().split(/\s+/);
  const castlingRights = parts[2]; // already "KQkq" or "-"
  const enPassantTarget = parts[3] === '-' ? null : parts[3];

  return {
    board,
    currentTurn: pos.currentTurn === PlayerColor.White ? 'w' : 'b',
    castlingRights,
    enPassantTarget,
    halfmoveClock: pos.halfmoveClock,
    fullmoveNumber: pos.fullmoveNumber,
  };
}
```

---

## 3. Database Schema

### 3.1 Extension Setup

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3.2 Table: `matches`

Stores every match created on-chain, indexed from `MatchCreatedEvent`.

```sql
CREATE TABLE matches (
    -- Primary key: the on-chain match ID (e.g., a UUID from the client)
    match_id            VARCHAR(32)     PRIMARY KEY,

    -- Players
    white_player        VARCHAR(44)     NOT NULL,           -- base58 Pubkey
    black_player        VARCHAR(44),                        -- NULL until Player2 joins

    -- Game state
    game_status         VARCHAR(20)     NOT NULL DEFAULT 'WaitingForOpponent',
        -- Values: 'WaitingForOpponent', 'Active', 'WhiteWins', 'BlackWins', 'Draw'
    game_end_reason     VARCHAR(20),
        -- Values: 'Checkmate', 'Stalemate', 'Resignation', 'Timeout', 'FiftyMoveRule'

    -- Betting / economics
    betting_token_mint  VARCHAR(44)     NOT NULL,           -- SPL mint address
    bet_amount_per_player BIGINT        NOT NULL,           -- raw lamports (no decimals)
    total_pot           BIGINT          NOT NULL,
    platform_fee_bps    INTEGER         NOT NULL DEFAULT 200, -- basis points (e.g., 200 = 2%)

    -- Timeout configuration
    move_timeout_seconds INTEGER        NOT NULL DEFAULT 900, -- seconds per move

    -- Timestamps
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,                        -- set when Player2 joins (Active)
    ended_at            TIMESTAMPTZ,                        -- set on GameEndedEvent
    last_move_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Settlement
    payout_processed    BOOLEAN         NOT NULL DEFAULT FALSE,
    payout_tx_signature VARCHAR(88),

    -- Metadata
    indexed_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(), -- when our indexer saw this
    last_webhook_slot   BIGINT,
    last_webhook_sig    VARCHAR(88)
);

-- Indexes
-- Look up active matches for the lobby / joinable list
CREATE INDEX idx_matches_status ON matches (game_status)
    WHERE game_status IN ('WaitingForOpponent', 'Active');

-- Look up a player's match history (most recent first)
CREATE INDEX idx_matches_white_player ON matches (white_player, created_at DESC);
CREATE INDEX idx_matches_black_player ON matches (black_player, created_at DESC)
    WHERE black_player IS NOT NULL;

-- Crank worker: find expired active matches
CREATE INDEX idx_matches_active_timeout ON matches (game_status, last_move_at)
    WHERE game_status = 'Active';
```

### 3.3 Table: `moves`

Stores every move made on-chain, indexed from `MoveMadeEvent`. **Includes the FEN string after the move** (computed server-side via Option C).

```sql
CREATE TABLE moves (
    -- Composite primary key: one row per (match, move_number)
    match_id            VARCHAR(32)     NOT NULL REFERENCES matches(match_id),
    move_number         INTEGER         NOT NULL,           -- 1-based, increments per full move

    -- Player info
    player_pubkey       VARCHAR(44)     NOT NULL,
    player_color        VARCHAR(5)      NOT NULL,           -- 'White' or 'Black'

    -- Move data
    from_row            SMALLINT        NOT NULL CHECK (from_row BETWEEN 0 AND 7),
    from_col            SMALLINT        NOT NULL CHECK (from_col BETWEEN 0 AND 7),
    to_row              SMALLINT        NOT NULL CHECK (to_row BETWEEN 0 AND 7),
    to_col              SMALLINT        NOT NULL CHECK (to_col BETWEEN 0 AND 7),
    algebraic_move      VARCHAR(10)     NOT NULL,           -- e.g., "e2e4", "e7e8q"
    promotion_piece     VARCHAR(6),                         -- 'Pawn','Knight','Bishop','Rook','Queen' or NULL

    -- FEN after this move (computed server-side, NOT from the on-chain event)
    fen_after_move      TEXT            NOT NULL,

    -- Game state flags
    is_check            BOOLEAN         NOT NULL DEFAULT FALSE,
    is_checkmate        BOOLEAN         NOT NULL DEFAULT FALSE,
    is_stalemate        BOOLEAN         NOT NULL DEFAULT FALSE,

    -- On-chain event metadata
    event_slot          BIGINT          NOT NULL,
    event_signature     VARCHAR(88)     NOT NULL,

    indexed_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (match_id, move_number)
);

-- Indexes
-- Fetch move history for a match in chronological order
CREATE INDEX idx_moves_match ON moves (match_id, move_number);

-- Idempotency: prevent duplicate webhook processing
CREATE UNIQUE INDEX idx_moves_event_sig ON moves (event_signature);
```

### 3.4 Table: `player_stats`

Aggregated statistics, updated on `GameEndedEvent`.

```sql
CREATE TABLE player_stats (
    player_pubkey       VARCHAR(44)     PRIMARY KEY,

    -- Match counts
    total_games         INTEGER         NOT NULL DEFAULT 0,
    wins                INTEGER         NOT NULL DEFAULT 0,
    losses              INTEGER         NOT NULL DEFAULT 0,
    draws               INTEGER         NOT NULL DEFAULT 0,

    -- Win reasons breakdown
    wins_by_checkmate   INTEGER         NOT NULL DEFAULT 0,
    wins_by_resignation INTEGER         NOT NULL DEFAULT 0,
    wins_by_timeout     INTEGER         NOT NULL DEFAULT 0,

    -- Streaks
    current_streak      INTEGER         NOT NULL DEFAULT 0, -- positive=wins, negative=losses
    longest_win_streak  INTEGER         NOT NULL DEFAULT 0,

    -- Tokens
    total_wagered       BIGINT          NOT NULL DEFAULT 0, -- raw lamports
    total_won           BIGINT          NOT NULL DEFAULT 0,

    -- Timestamps
    last_game_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Leaderboard query: top players by wins
CREATE INDEX idx_player_stats_wins ON player_stats (wins DESC, total_games);

-- Leaderboard query: top players by win rate (minimum 10 games)
CREATE INDEX idx_player_stats_winrate ON player_stats (total_games, wins);
```

### 3.5 Table: `elo_history`

Tracks rating changes over time.

```sql
CREATE TABLE elo_history (
    id                  BIGSERIAL       PRIMARY KEY,

    player_pubkey       VARCHAR(44)     NOT NULL,
    match_id            VARCHAR(32)     NOT NULL REFERENCES matches(match_id),

    elo_before          INTEGER         NOT NULL,
    elo_after           INTEGER         NOT NULL,
    elo_change          INTEGER         NOT NULL,           -- can be negative
    k_factor            INTEGER         NOT NULL DEFAULT 32,

    opponent_pubkey     VARCHAR(44)     NOT NULL,
    opponent_elo        INTEGER         NOT NULL,

    recorded_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Player ELO history (most recent first)
CREATE INDEX idx_elo_player ON elo_history (player_pubkey, recorded_at DESC);

-- Current ELO: latest entry per player
CREATE INDEX idx_elo_current ON elo_history (player_pubkey, recorded_at DESC);

-- Match-level: both players' ELO for a given match
CREATE INDEX idx_elo_match ON elo_history (match_id);
```

### 3.6 Table: `prediction_pools` (Future)

```sql
CREATE TABLE prediction_pools (
    pool_id             VARCHAR(64)     PRIMARY KEY,        -- on-chain pool address
    match_id            VARCHAR(32)     NOT NULL REFERENCES matches(match_id),
    pool_token_mint     VARCHAR(44)     NOT NULL,
    total_bets_white    BIGINT          NOT NULL DEFAULT 0,
    total_bets_black    BIGINT          NOT NULL DEFAULT 0,
    total_bets_draw     BIGINT          NOT NULL DEFAULT 0,
    pool_status         VARCHAR(20)     NOT NULL DEFAULT 'Open',
        -- 'Open', 'Closed', 'Resolved'
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_pools_match ON prediction_pools (match_id);
CREATE INDEX idx_pools_status ON prediction_pools (pool_status) WHERE pool_status = 'Open';
```

### 3.7 Table: `prediction_bets` (Future)

```sql
CREATE TABLE prediction_bets (
    bet_id              BIGSERIAL       PRIMARY KEY,
    pool_id             VARCHAR(64)     NOT NULL REFERENCES prediction_pools(pool_id),
    bettor_pubkey       VARCHAR(44)     NOT NULL,
    predicted_outcome   VARCHAR(10)     NOT NULL,           -- 'White', 'Black', 'Draw'
    bet_amount          BIGINT          NOT NULL,
    odds_at_bet         NUMERIC(8, 4),
    event_signature     VARCHAR(88)     NOT NULL,
    placed_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bets_pool ON prediction_bets (pool_id);
CREATE INDEX idx_bets_bettor ON prediction_bets (bettor_pubkey, placed_at DESC);
CREATE UNIQUE INDEX idx_bets_event_sig ON prediction_bets (event_signature);
```

### 3.8 Table: `webhook_events` (Idempotency / Audit)

A raw event log for debugging and replay capability.

```sql
CREATE TABLE webhook_events (
    id                  BIGSERIAL       PRIMARY KEY,
    event_signature     VARCHAR(88)     NOT NULL,
    event_type          VARCHAR(30)     NOT NULL,
        -- 'MatchCreatedEvent','PlayerJoinedEvent','MoveMadeEvent',
        -- 'GameEndedEvent','PayoutEvent','DrawPayoutEvent'
    event_slot          BIGINT          NOT NULL,
    raw_payload         JSONB           NOT NULL,
    processed           BOOLEAN         NOT NULL DEFAULT FALSE,
    error_message       TEXT,
    received_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

-- Idempotency: skip already-processed events
CREATE UNIQUE INDEX idx_webhook_sig ON webhook_events (event_signature);

-- Re-process failed events
CREATE INDEX idx_webhook_unprocessed ON webhook_events (processed, received_at)
    WHERE processed = FALSE;
```

---

## 4. Helius Webhook Handler

### 4.1 Webhook Endpoint

```
POST /api/webhooks/helius
Authorization: Bearer <WEBHOOK_SECRET>
```

**Request Body:**

```typescript
type HeliusWebhookPayload = Array<{
  type: string;           // Event discriminator, e.g. "MATCH_CREATED"
  data: Record<string, any>; // Anchor event fields (camelCase from Anchor IDL)
  signature: string;      // Transaction signature (base58)
  slot: number;
}>;
```

The `type` field is derived from the Anchor event discriminator. Mapping:

| Anchor Event Struct      | Webhook `type`       |
|--------------------------|----------------------|
| `MatchCreatedEvent`      | `MATCH_CREATED`      |
| `PlayerJoinedEvent`      | `PLAYER_JOINED`      |
| `MoveMadeEvent`          | `MOVE_MADE`          |
| `GameEndedEvent`         | `GAME_ENDED`         |
| `PayoutEvent`            | `PAYOUT`             |
| `DrawPayoutEvent`        | `DRAW_PAYOUT`        |

### 4.2 Handler Pseudocode

```typescript
// backend/src/routes/webhooks.ts

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Configuration: webhook auth token (set via env var)
const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET!;

// Board cache: in-memory Map for active matches (single-process, backed by Redis for multi-process)
// Key: matchId, Value: ChessPosition
const boardCache = new Map<string, ChessPosition>();

interface WebhookEvent {
  type: string;
  data: Record<string, any>;
  signature: string;
  slot: number;
}

export async function heliusWebhookRoutes(app: FastifyInstance, db: Pool, redis: Redis) {
  app.post('/api/webhooks/helius', {
    preHandler: async (request, reply) => {
      const auth = request.headers.authorization;
      if (!auth || auth !== `Bearer ${WEBHOOK_SECRET}`) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    },
    handler: async (request: FastifyRequest<{ Body: WebhookEvent[] }>, reply) => {
      const events = request.body;
      const results: { signature: string; status: string }[] = [];

      for (const event of events) {
        try {
          await processEvent(event, db, redis);
          results.push({ signature: event.signature, status: 'processed' });
        } catch (err: any) {
          // Duplicate events (unique constraint violation) are NOT errors
          if (isDuplicateError(err)) {
            results.push({ signature: event.signature, status: 'skipped_duplicate' });
          } else {
            console.error(`Failed to process event ${event.type} ${event.signature}:`, err);
            results.push({ signature: event.signature, status: 'error' });
            // Continue processing remaining events; do not fail the whole batch
          }
        }
      }

      reply.send({ processed: results.length, results });
    },
  });
}
```

### 4.3 Per-Event Processing Logic

```typescript
async function processEvent(
  event: WebhookEvent,
  db: Pool,
  redis: Redis
): Promise<void> {
  const { type, data, signature, slot } = event;

  // 1. Idempotency check
  const existing = await db.query(
    'SELECT id FROM webhook_events WHERE event_signature = $1',
    [signature]
  );
  if (existing.rows.length > 0) {
    throw new Error('DUPLICATE'); // Caught by caller
  }

  // 2. Record raw event
  await db.query(
    `INSERT INTO webhook_events (event_signature, event_type, event_slot, raw_payload)
     VALUES ($1, $2, $3, $4)`,
    [signature, type, slot, JSON.stringify(data)]
  );

  // 3. Dispatch by event type
  switch (type) {
    case 'MATCH_CREATED':
      await handleMatchCreated(data, signature, slot, db, redis);
      break;
    case 'PLAYER_JOINED':
      await handlePlayerJoined(data, signature, slot, db, redis);
      break;
    case 'MOVE_MADE':
      await handleMoveMade(data, signature, slot, db, redis);
      break;
    case 'GAME_ENDED':
      await handleGameEnded(data, signature, slot, db, redis);
      break;
    case 'PAYOUT':
      await handlePayout(data, signature, slot, db, redis);
      break;
    case 'DRAW_PAYOUT':
      await handleDrawPayout(data, signature, slot, db, redis);
      break;
    default:
      console.warn(`Unknown event type: ${type}`);
  }

  // 4. Mark as processed
  await db.query(
    'UPDATE webhook_events SET processed = TRUE, processed_at = NOW() WHERE event_signature = $1',
    [signature]
  );
}
```

### 4.4 `handleMatchCreated`

```typescript
async function handleMatchCreated(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const {
    matchId,
    creator,
    bettingTokenMint,
    betAmount,
    moveTimeoutDuration,
    platformFeeBasisPoints,
  } = data;

  await db.query(
    `INSERT INTO matches (
       match_id, white_player, betting_token_mint, bet_amount_per_player,
       total_pot, platform_fee_bps, move_timeout_seconds,
       last_move_at, last_webhook_slot, last_webhook_sig
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
     ON CONFLICT (match_id) DO NOTHING`,
    [
      matchId, creator, bettingTokenMint, betAmount,
      betAmount, platformFeeBasisPoints, moveTimeoutDuration,
      slot, signature,
    ]
  );

  // Initialize board cache for this match (Option C)
  const startingBoard = initializeChessBoard(); // see Section 5.2
  boardCache.set(matchId, {
    board: startingBoard,
    currentTurn: PlayerColor.White,
    castlingRights: { whiteKingside: true, whiteQueenside: true, blackKingside: true, blackQueenside: true },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  });

  // Cache in Redis for multi-process access
  await redis.set(
    `match:${matchId}:board`,
    JSON.stringify(boardCache.get(matchId)),
    'EX', 86400 // 24h TTL (extended if game is active)
  );

  const startingFen = boardToFen(boardCache.get(matchId)!);
  await redis.set(`match:${matchId}:fen`, startingFen, 'EX', 86400);

  // Add to joinable lobby
  await redis.zadd('lobby:joinable', Date.now(), matchId);

  // Publish event for WebSocket gateway
  await redis.publish('match:created', JSON.stringify({
    matchId, creator, betAmount: betAmount.toString(),
    moveTimeoutDuration, platformFeeBasisPoints,
  }));
}
```

### 4.5 `handlePlayerJoined`

```typescript
async function handlePlayerJoined(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const { matchId, playerOne, playerTwo, betAmountPerPlayer } = data;

  await db.query(
    `UPDATE matches
     SET black_player = $1,
         bet_amount_player_two = $2,
         total_pot = total_pot + $2,
         game_status = 'Active',
         started_at = NOW(),
         last_move_at = NOW(),
         last_webhook_slot = $3,
         last_webhook_sig = $4
     WHERE match_id = $5`,
    [playerTwo, betAmountPerPlayer, slot, signature, matchId]
  );

  // Remove from joinable lobby
  await redis.zrem('lobby:joinable', matchId);

  // Publish event
  await redis.publish('match:joined', JSON.stringify({
    matchId, playerOne, playerTwo, betAmountPerPlayer: betAmountPerPlayer.toString(),
  }));
}
```

### 4.6 `handleMoveMade`

This is where Option C (server-side board cache) is used to compute FEN.

```typescript
async function handleMoveMade(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const {
    matchId, player, playerColor, algebraicMove,
    fromRow, fromCol, toRow, toCol, promotionPiece,
    isCheck, isCheckmate, isStalemate,
  } = data;

  // 1. Apply the move to our cached board state (Option C)
  let gamePosition = boardCache.get(matchId);

  if (!gamePosition) {
    // Cache miss: try Redis, or fetch + deserialize from on-chain (fallback)
    const cached = await redis.get(`match:${matchId}:board`);
    if (cached) {
      gamePosition = JSON.parse(cached);
    } else {
      // Option A fallback: fetch ChessMatch account from RPC, deserialize, convert
      gamePosition = await fetchAndConvertBoardState(matchId);
    }
  }

  // 2. Apply the move
  gamePosition = applyMoveToBoard(gamePosition, {
    fromRow, fromCol, toRow, toCol, promotionPiece,
    playerColor: playerColor === 'White' ? PlayerColor.White : PlayerColor.Black,
  });

  // 3. Update caches
  boardCache.set(matchId, gamePosition);
  await redis.set(`match:${matchId}:board`, JSON.stringify(gamePosition));

  // 4. Compute FEN
  const fen = boardToFen(gamePosition);
  await redis.set(`match:${matchId}:fen`, fen);

  // 5. Determine move_number
  // After Black moves, fullmove_number increments. We store the move_number
  // as the fullmove_number AFTER the turn was switched in chess_logic.
  // Since Black just moved, fullmove_number was already incremented on-chain.
  // For storage, we treat each MakeMove as a sequential entry.
  const moveCount = await db.query(
    'SELECT COUNT(*) as cnt FROM moves WHERE match_id = $1',
    [matchId]
  );
  const moveNumber = parseInt(moveCount.rows[0].cnt) + 1;

  // 6. Insert into moves table
  await db.query(
    `INSERT INTO moves (
       match_id, move_number, player_pubkey, player_color,
       from_row, from_col, to_row, to_col,
       algebraic_move, promotion_piece, fen_after_move,
       is_check, is_checkmate, is_stalemate,
       event_slot, event_signature
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (event_signature) DO NOTHING`,
    [
      matchId, moveNumber, player, playerColor,
      fromRow, fromCol, toRow, toCol,
      algebraicMove, promotionPiece, fen,
      isCheck, isCheckmate, isStalemate,
      slot, signature,
    ]
  );

  // 7. Update match timestamp
  await db.query(
    'UPDATE matches SET last_move_at = NOW(), last_webhook_slot = $2, last_webhook_sig = $3 WHERE match_id = $1',
    [matchId, slot, signature]
  );

  // 8. Publish to Redis (WebSocket broadcast)
  await redis.publish('move:made', JSON.stringify({
    matchId, moveNumber, player, playerColor,
    algebraicMove, fen,
    isCheck, isCheckmate, isStalemate,
  }));

  // 9. If game ended on this move, GAME_ENDED event follows separately
  //    (handled by handleGameEnded)
}
```

### 4.7 `handleGameEnded`

```typescript
async function handleGameEnded(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const { matchId, status, winner, reason } = data;

  // Map Anchor enum to DB string
  const statusMap: Record<string, string> = {
    WhiteWins: 'WhiteWins',
    BlackWins: 'BlackWins',
    Draw: 'Draw',
  };

  await db.query(
    `UPDATE matches
     SET game_status = $1,
         game_end_reason = $2,
         ended_at = NOW(),
         last_webhook_slot = $3,
         last_webhook_sig = $4
     WHERE match_id = $5`,
    [statusMap[status] || status, reason, slot, signature, matchId]
  );

  // Update player stats
  await updatePlayerStats(db, matchId, status, winner, reason);

  // Update ELO (future)
  // await updateElo(db, matchId, status, winner);

  // Remove board cache (game is over)
  boardCache.delete(matchId);
  // Keep the board cached in Redis with a shorter TTL for post-game viewing
  await redis.expire(`match:${matchId}:board`, 3600); // 1 hour
  await redis.expire(`match:${matchId}:fen`, 3600);

  // Remove from active set, add to completed
  await redis.publish('game:ended', JSON.stringify({
    matchId, status, winner, reason,
  }));
}
```

### 4.8 `handlePayout` / `handleDrawPayout`

```typescript
async function handlePayout(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const { matchId, winner, amount, fee } = data;

  await db.query(
    `UPDATE matches
     SET payout_processed = TRUE,
         payout_tx_signature = $1,
         last_webhook_slot = $2,
         last_webhook_sig = $3
     WHERE match_id = $4`,
    [signature, slot, signature, matchId]
  );

  // Publish for UI notifications
  await redis.publish('payout:processed', JSON.stringify({
    matchId, winner, amount: amount.toString(), fee: fee.toString(),
  }));
}

async function handleDrawPayout(
  data: any, signature: string, slot: number,
  db: Pool, redis: Redis
): Promise<void> {
  const { matchId, whitePlayer, blackPlayer, amountEach, fee } = data;

  await db.query(
    `UPDATE matches
     SET payout_processed = TRUE,
         payout_tx_signature = $1,
         last_webhook_slot = $2,
         last_webhook_sig = $3
     WHERE match_id = $4`,
    [signature, slot, signature, matchId]
  );

  await redis.publish('payout:processed', JSON.stringify({
    matchId, type: 'draw', whitePlayer, blackPlayer,
    amountEach: amountEach.toString(), fee: fee.toString(),
  }));
}
```

### 4.9 Player Stats Update

```typescript
async function updatePlayerStats(
  db: Pool,
  matchId: string,
  status: string,
  winner: string | null,
  reason: string
): Promise<void> {
  const matchResult = await db.query(
    'SELECT white_player, black_player FROM matches WHERE match_id = $1',
    [matchId]
  );
  const { white_player, black_player } = matchResult.rows[0];

  // Determine winner/loser pubkeys
  let winnerPubkey: string | null = null;
  let loserPubkey: string | null = null;

  if (status === 'WhiteWins') {
    winnerPubkey = white_player;
    loserPubkey = black_player;
  } else if (status === 'BlackWins') {
    winnerPubkey = black_player;
    loserPubkey = white_player;
  }
  // Draw: no winnerPubkey/loserPubkey

  const incrementColumn = (isWin: boolean, reason: string): string => {
    if (!isWin) return '';
    switch (reason) {
      case 'Checkmate': return 'wins_by_checkmate = wins_by_checkmate + 1,';
      case 'Resignation': return 'wins_by_resignation = wins_by_resignation + 1,';
      case 'Timeout': return 'wins_by_timeout = wins_by_timeout + 1,';
      default: return '';
    }
  };

  // Upsert winner stats
  if (winnerPubkey) {
    await db.query(
      `INSERT INTO player_stats (player_pubkey, total_games, wins, ${incrementColumn(true, reason)}
       current_streak)
       VALUES ($1, 1, 1, CASE WHEN current_streak >= 0 THEN 1 ELSE NULL END)
       ON CONFLICT (player_pubkey) DO UPDATE SET
         total_games = player_stats.total_games + 1,
         wins = player_stats.wins + 1,
         ${incrementColumn(true, reason).replace(/,/g, ' = player_stats.')} -- rough, refine in real code
         longest_win_streak = GREATEST(player_stats.longest_win_streak, player_stats.current_streak + 1),
         current_streak = CASE WHEN player_stats.current_streak >= 0
           THEN player_stats.current_streak + 1 ELSE 1 END,
         last_game_at = NOW(),
         updated_at = NOW()`,
      [winnerPubkey]
    );
  }

  // Upsert loser stats
  if (loserPubkey) {
    await db.query(
      `INSERT INTO player_stats (player_pubkey, total_games, losses, current_streak)
       VALUES ($1, 1, 1, -1)
       ON CONFLICT (player_pubkey) DO UPDATE SET
         total_games = player_stats.total_games + 1,
         losses = player_stats.losses + 1,
         current_streak = CASE WHEN player_stats.current_streak <= 0
           THEN player_stats.current_streak - 1 ELSE -1 END,
         last_game_at = NOW(),
         updated_at = NOW()`,
      [loserPubkey]
    );
  }

  // For draws, both players get a draw
  if (status === 'Draw') {
    for (const pubkey of [white_player, black_player]) {
      if (!pubkey) continue;
      await db.query(
        `INSERT INTO player_stats (player_pubkey, total_games, draws)
         VALUES ($1, 1, 1)
         ON CONFLICT (player_pubkey) DO UPDATE SET
           total_games = player_stats.total_games + 1,
           draws = player_stats.draws + 1,
           last_game_at = NOW(),
           updated_at = NOW()`,
        [pubkey]
      );
    }
  }
}
```

---

## 5. FEN Integration Strategy (Option C)

### 5.1 Rationale

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Fetch ChessMatch account + deserialize + convert on every MoveMadeEvent | Simple, no state to maintain | 1 RPC call per move; slow; Helius rate limits; unnecessary overhead |
| B | Compute FEN client-side, send to backend, store in DB | No backend computation | Trusts client; FEN not validated on-chain; attack vector (clients can submit wrong FEN) |
| **C** | **Backend maintains cached board state per match** | Fast (no RPC); authoritative (derived from on-chain events); one-time board init | Must handle cache invalidation; multi-process coordination via Redis |

**Recommendation: Option C.** The board state is fully reconstructable from the event stream: `MatchCreatedEvent` sets the initial board, and each `MoveMadeEvent` provides exact `(from_row, from_col, to_row, to_col, promotion)` data needed to apply the move. There is no ambiguity -- the on-chain program already validated the move; we just replay it.

### 5.2 Board Initialization (On MatchCreatedEvent)

```typescript
/**
 * Initialize the standard starting chess board.
 * Mirrors the Rust `initialize_chess_board()` function.
 *
 * Row 0 = White's back rank, Row 7 = Black's back rank.
 */
function initializeChessBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );

  // White pawns on row 1
  for (let col = 0; col < 8; col++) {
    board[1][col] = { pieceType: PieceType.Pawn, color: PlayerColor.White };
  }

  // Black pawns on row 6
  for (let col = 0; col < 8; col++) {
    board[6][col] = { pieceType: PieceType.Pawn, color: PlayerColor.Black };
  }

  // Back rank pieces (standard order)
  const backRankOrder = [
    PieceType.Rook, PieceType.Knight, PieceType.Bishop, PieceType.Queen,
    PieceType.King, PieceType.Bishop, PieceType.Knight, PieceType.Rook,
  ];

  // White back rank (row 0)
  for (let col = 0; col < 8; col++) {
    board[0][col] = { pieceType: backRankOrder[col], color: PlayerColor.White };
  }

  // Black back rank (row 7)
  for (let col = 0; col < 8; col++) {
    board[7][col] = { pieceType: backRankOrder[col], color: PlayerColor.Black };
  }

  return board;
}
```

### 5.3 Move Application (On MoveMadeEvent)

```typescript
interface MoveApplyArgs {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotionPiece: PieceType | null;
  playerColor: PlayerColor;
}

/**
 * Apply a move to the cached board state.
 * Mirrors the on-chain `validate_and_apply_move` (but skips validation --
 * the program already did that). We only need to mutate the board,
 * castling rights, en passant target, halfmove clock, and fullmove number.
 */
function applyMoveToBoard(
  position: ChessPosition,
  args: MoveApplyArgs
): ChessPosition {
  const { fromRow, fromCol, toRow, toCol, promotionPiece, playerColor } = args;

  // Deep-clone the board (avoid mutation of the cached position)
  const board: (Piece | null)[][] = position.board.map(row => [...row]);
  const castlingRights: CastlingRights = { ...position.castlingRights };
  let enPassantTarget: EnPassantSquare | null = null;
  let halfmoveClock = position.halfmoveClock;
  let fullmoveNumber = position.fullmoveNumber;

  const piece = board[fromRow][fromCol];
  if (!piece) {
    throw new Error(`No piece at source square (${fromRow},${fromCol})`);
  }

  const pieceType = piece.pieceType;
  const targetPiece = board[toRow][toCol];
  const isCapture = targetPiece !== null;

  // --- Handle en passant capture ---
  let actualCapture = isCapture;
  if (pieceType === PieceType.Pawn && position.enPassantTarget) {
    const ep = position.enPassantTarget;
    if (ep.row === toRow && ep.col === toCol &&
        Math.abs(toCol - fromCol) === 1 &&
        Math.abs(toRow - fromRow) === 1) {
      const capturedPawnRow = playerColor === PlayerColor.White ? toRow - 1 : toRow + 1;
      board[capturedPawnRow][toCol] = null;
      actualCapture = true;
    }
  }

  // --- Update castling rights ---
  if (pieceType === PieceType.King) {
    if (playerColor === PlayerColor.White) {
      castlingRights.whiteKingside = false;
      castlingRights.whiteQueenside = false;
    } else {
      castlingRights.blackKingside = false;
      castlingRights.blackQueenside = false;
    }
  } else if (pieceType === PieceType.Rook) {
    if (playerColor === PlayerColor.White) {
      if (fromRow === 0 && fromCol === 0) castlingRights.whiteQueenside = false;
      if (fromRow === 0 && fromCol === 7) castlingRights.whiteKingside = false;
    } else {
      if (fromRow === 7 && fromCol === 0) castlingRights.blackQueenside = false;
      if (fromRow === 7 && fromCol === 7) castlingRights.blackKingside = false;
    }
  }

  // If a rook is captured on its starting square, revoke that side's right
  if (targetPiece?.pieceType === PieceType.Rook) {
    if (toRow === 0 && toCol === 0) castlingRights.whiteQueenside = false;
    if (toRow === 0 && toCol === 7) castlingRights.whiteKingside = false;
    if (toRow === 7 && toCol === 0) castlingRights.blackQueenside = false;
    if (toRow === 7 && toCol === 7) castlingRights.blackKingside = false;
  }

  // --- Move the piece ---
  board[fromRow][fromCol] = null;

  // Handle promotion
  let finalPiece = piece;
  if (pieceType === PieceType.Pawn &&
      ((playerColor === PlayerColor.White && toRow === 7) ||
       (playerColor === PlayerColor.Black && toRow === 0))) {
    finalPiece = {
      pieceType: promotionPiece || PieceType.Queen, // default to Queen
      color: playerColor,
    };
  }

  board[toRow][toCol] = finalPiece;

  // --- Handle castling rook movement ---
  if (pieceType === PieceType.King && Math.abs(toCol - fromCol) === 2) {
    const isKingside = toCol > fromCol;
    const rookFromCol = isKingside ? 7 : 0;
    const rookToCol = isKingside ? 5 : 3;
    const rook = board[fromRow][rookFromCol];
    board[fromRow][rookFromCol] = null;
    board[fromRow][rookToCol] = rook;
  }

  // --- Set en passant target ---
  if (pieceType === PieceType.Pawn && Math.abs(toRow - fromRow) === 2) {
    const epRow = (fromRow + toRow) / 2;
    enPassantTarget = { row: epRow, col: fromCol };
  }

  // --- Update halfmove clock ---
  if (pieceType === PieceType.Pawn || actualCapture) {
    halfmoveClock = 0;
  } else {
    halfmoveClock++;
  }

  // --- Update fullmove number ---
  if (playerColor === PlayerColor.Black) {
    fullmoveNumber++;
  }

  // --- Switch turn ---
  const newTurn = playerColor === PlayerColor.White
    ? PlayerColor.Black
    : PlayerColor.White;

  return {
    board,
    currentTurn: newTurn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}
```

### 5.4 Cache Invalidation & Recovery

In single-process mode, the `boardCache` Map lives in memory. On server restart:

1. Active matches are identified: `SELECT match_id FROM matches WHERE game_status = 'Active'`
2. For each active match, reconstruct board state by replaying all `MoveMadeEvent` rows for that match from `MatchCreatedEvent` onward.

```typescript
async function warmBoardCache(db: Pool, redis: Redis): Promise<void> {
  const activeMatches = await db.query(
    "SELECT match_id FROM matches WHERE game_status = 'Active'"
  );

  for (const { match_id } of activeMatches.rows) {
    // Try Redis first
    const cached = await redis.get(`match:${match_id}:board`);
    if (cached) {
      boardCache.set(match_id, JSON.parse(cached));
      continue;
    }

    // Rebuild from event replay
    const moves = await db.query(
      `SELECT from_row, from_col, to_row, to_col, promotion_piece, player_color
       FROM moves WHERE match_id = $1 ORDER BY move_number ASC`,
      [match_id]
    );

    let position: ChessPosition = {
      board: initializeChessBoard(),
      currentTurn: PlayerColor.White,
      castlingRights: { whiteKingside: true, whiteQueenside: true, blackKingside: true, blackQueenside: true },
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };

    for (const move of moves.rows) {
      position = applyMoveToBoard(position, {
        fromRow: move.from_row,
        fromCol: move.from_col,
        toRow: move.to_row,
        toCol: move.to_col,
        promotionPiece: move.promotion_piece,
        playerColor: move.player_color === 'White' ? PlayerColor.White : PlayerColor.Black,
      });
    }

    boardCache.set(match_id, position);
    await redis.set(`match:${match_id}:board`, JSON.stringify(position));
    await redis.set(`match:${match_id}:fen`, boardToFen(position));
  }
}
```

---

## 6. API Endpoints

### 6.1 Base Configuration

```typescript
// backend/src/app.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CORS_ORIGIN || '*' });
await app.register(websocket);
```

### 6.2 `GET /api/matches/:matchId`

Returns full match details including current FEN.

**Response:**

```json
{
  "matchId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "whitePlayer": "AbCdEf1234567890AbCdEf1234567890AbCdEf12",
  "blackPlayer": "BbCcDd2234567890BbCcDd2234567890BbCcDd22",
  "gameStatus": "Active",
  "gameEndReason": null,
  "bettingTokenMint": "So11111111111111111111111111111111111111112",
  "betAmountPerPlayer": "100000000",
  "totalPot": "200000000",
  "platformFeeBps": 200,
  "moveTimeoutSeconds": 900,
  "currentTurn": "White",
  "boardFen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "createdAt": "2026-08-02T12:00:00Z",
  "startedAt": "2026-08-02T12:01:30Z",
  "endedAt": null,
  "lastMoveAt": "2026-08-02T12:05:45Z",
  "payoutProcessed": false,
  "moveCount": 5
}
```

**SQL:**

```sql
SELECT
  m.match_id,
  m.white_player,
  m.black_player,
  m.game_status,
  m.game_end_reason,
  m.betting_token_mint,
  m.bet_amount_per_player,
  m.total_pot,
  m.platform_fee_bps,
  m.move_timeout_seconds,
  m.created_at,
  m.started_at,
  m.ended_at,
  m.last_move_at,
  m.payout_processed,
  (SELECT COUNT(*) FROM moves WHERE moves.match_id = m.match_id) AS move_count
FROM matches m
WHERE m.match_id = $1
```

The `currentTurn` and `boardFen` fields come from Redis cache (`match:{matchId}:fen`), parsed to extract the `w`/`b` active color field.

### 6.3 `GET /api/matches`

Lists matches with optional filters.

**Query Parameters:**

| Param     | Type   | Default  | Description |
|-----------|--------|----------|-------------|
| `status`  | string | (all)    | Filter: `Active`, `WaitingForOpponent`, `Completed` |
| `player`  | string | (none)   | Filter by player pubkey |
| `page`    | number | 1        | Page number |
| `limit`   | number | 20       | Results per page (max 100) |

**Response:**

```json
{
  "matches": [
    {
      "matchId": "...",
      "whitePlayer": "...",
      "blackPlayer": "...",
      "gameStatus": "Active",
      "totalPot": "200000000",
      "bettingTokenMint": "...",
      "createdAt": "2026-08-02T12:00:00Z",
      "boardFen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      "moveCount": 5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}
```

**SQL:**

```sql
SELECT
  match_id, white_player, black_player, game_status,
  total_pot, betting_token_mint, created_at, last_move_at,
  (SELECT COUNT(*) FROM moves WHERE moves.match_id = matches.match_id) AS move_count
FROM matches
WHERE
  ($1::varchar IS NULL OR game_status = $1)
  AND ($2::varchar IS NULL OR white_player = $2 OR black_player = $2)
ORDER BY created_at DESC
LIMIT $3 OFFSET $4
```

### 6.4 `GET /api/matches/:matchId/history`

Returns the full move history with FEN after each move.

**Response:**

```json
{
  "matchId": "a1b2c3d4-...",
  "whitePlayer": "...",
  "blackPlayer": "...",
  "moves": [
    {
      "moveNumber": 1,
      "playerColor": "White",
      "playerPubkey": "...",
      "algebraicMove": "e2e4",
      "from": "e2",
      "to": "e4",
      "fenAfter": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      "isCheck": false,
      "isCheckmate": false,
      "isStalemate": false
    },
    {
      "moveNumber": 2,
      "playerColor": "Black",
      "playerPubkey": "...",
      "algebraicMove": "e7e5",
      "from": "e7",
      "to": "e5",
      "fenAfter": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
      "isCheck": false,
      "isCheckmate": false,
      "isStalemate": false
    }
  ],
  "totalMoves": 2
}
```

**SQL:**

```sql
SELECT
  move_number, player_color, player_pubkey,
  algebraic_move, from_row, from_col, to_row, to_col,
  fen_after_move, is_check, is_checkmate, is_stalemate
FROM moves
WHERE match_id = $1
ORDER BY move_number ASC
```

### 6.5 `GET /api/matches/:matchId/export`

Returns a PGN string for the match. See Section 7.

**Response:**

```json
{
  "matchId": "...",
  "pgn": "[Event \"Magic Speed Chess - Rapid\"]\n[Site \"https://...\"]\n..."
}
```

### 6.6 `GET /api/leaderboard`

Returns the top players by wins, win rate, or ELO.

**Query Parameters:**

| Param    | Type   | Default | Description |
|----------|--------|---------|-------------|
| `sortBy` | string | `wins`  | `wins`, `winRate`, `totalGames` |
| `limit`  | number | 10      | Max 100 |

**Response:**

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "playerPubkey": "...",
      "totalGames": 50,
      "wins": 35,
      "losses": 10,
      "draws": 5,
      "winRate": 0.7,
      "currentStreak": 5,
      "longestWinStreak": 12
    }
  ],
  "updatedAt": "2026-08-02T12:00:00Z"
}
```

### 6.7 `GET /api/players/:pubkey/stats`

**Response:**

```json
{
  "playerPubkey": "...",
  "totalGames": 50,
  "wins": 35,
  "losses": 10,
  "draws": 5,
  "winRate": 0.7,
  "winsByCheckmate": 20,
  "winsByResignation": 8,
  "winsByTimeout": 7,
  "currentStreak": 5,
  "longestWinStreak": 12,
  "totalWagered": "5000000000",
  "totalWon": "6000000000",
  "lastGameAt": "2026-08-02T11:30:00Z"
}
```

### 6.8 `GET /api/players/:pubkey/matches`

Paginated match history for a specific player.

**Query Parameters:** `page`, `limit`, `status` (filter)

### 6.9 `GET /api/health`

```json
{
  "status": "ok",
  "uptime": 86400,
  "db": "connected",
  "redis": "connected",
  "activeMatches": 12,
  "cachedBoards": 12
}
```

---

## 7. PGN Export Design

### 7.1 PGN Format

Portable Game Notation (PGN) is the universal format for sharing chess games. It consists of tag pairs (metadata) and movetext (the actual moves).

```
[Event "Event Name"]
[Site "Site URL"]
[Date "YYYY.MM.DD"]
[Round "-"]
[White "White Player"]
[Black "Black Player"]
[Result "1-0"]
[TimeControl "900+0"]        ; per-move timeout in seconds + increment (0 for our model)
[FEN "starting FEN"]
[SetUp "1"]                  ; only if non-standard starting position

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
```

### 7.2 PGN Tag Mapping

| PGN Tag        | Source Field                 |
|----------------|------------------------------|
| `Event`        | `"Magic Speed Chess"` + optional time control name |
| `Site`         | Configurable URL (env: `APP_URL`) |
| `Date`         | `matches.created_at`         |
| `White`        | `matches.white_player` (truncated pubkey or resolved username) |
| `Black`        | `matches.black_player`       |
| `Result`       | Derived: `"1-0"` (White wins), `"0-1"` (Black wins), `"1/2-1/2"` (Draw), `"*"` (incomplete) |
| `TimeControl`  | `matches.move_timeout_seconds + "+0"` |
| `FEN`          | Starting position FEN        |

### 7.3 Algebraic Move Generation for PGN

The `MoveMadeEvent` provides `algebraic_move` in coordinate format (e.g., `"e2e4"`). For PGN, we need Standard Algebraic Notation (SAN). This requires board context at the time of the move to disambiguate (e.g., `"Nf3"` vs `"Nbd2"` when two knights can reach the same square).

Since we have the board state and the exact `(from_row, from_col, to_row, to_col)`, we can compute SAN:

```typescript
/**
 * Convert a coordinate move (e2e4, e7e8q) into Standard Algebraic Notation (SAN).
 * Requires the board state BEFORE the move.
 */
function toSan(
  board: (Piece | null)[][],
  fromRow: number, fromCol: number,
  toRow: number, toCol: number,
  promotionPiece: PieceType | null,
  isCheck: boolean,
  isCheckmate: boolean
): string {
  const piece = board[fromRow][fromCol];
  if (!piece) throw new Error('No piece at source');

  const fromFile = String.fromCharCode('a'.charCodeAt(0) + fromCol);
  const fromRank = (fromRow + 1).toString();
  const toFile = String.fromCharCode('a'.charCodeAt(0) + toCol);
  const toRank = (toRow + 1).toString();
  const toSquare = `${toFile}${toRank}`;

  const isCapture = board[toRow][toCol] !== null;

  // Determine piece letter (empty for pawns)
  const pieceLetter: Record<number, string> = {
    [PieceType.King]: 'K', [PieceType.Queen]: 'Q', [PieceType.Rook]: 'R',
    [PieceType.Bishop]: 'B', [PieceType.Knight]: 'N', [PieceType.Pawn]: '',
  };

  let moveStr = '';

  // Castling
  if (piece.pieceType === PieceType.King && Math.abs(toCol - fromCol) === 2) {
    moveStr = toCol > fromCol ? 'O-O' : 'O-O-O';
  }
  // Pawn moves
  else if (piece.pieceType === PieceType.Pawn) {
    if (isCapture) {
      moveStr = `${fromFile}x${toSquare}`;
    } else {
      moveStr = toSquare;
    }
    // Promotion
    if (promotionPiece) {
      const promoChar = PIECE_TO_FEN_CHAR[promotionPiece].white; // uppercase
      moveStr += `=${promoChar}`;
    }
  }
  // Piece moves (N, B, R, Q, K)
  else {
    const pLetter = pieceLetter[piece.pieceType];

    // Disambiguation: check if another piece of same type and color can also move to toSquare
    const disambiguation = getDisambiguation(board, piece, fromRow, fromCol, toRow, toCol);

    moveStr = pLetter + disambiguation;
    if (isCapture) moveStr += 'x';
    moveStr += toSquare;
  }

  // Check/checkmate suffix
  if (isCheckmate) moveStr += '#';
  else if (isCheck) moveStr += '+';

  return moveStr;
}

/**
 * Determine the disambiguation string (file, rank, or both) when multiple
 * pieces of the same type can reach the target square.
 */
function getDisambiguation(
  board: (Piece | null)[][],
  movingPiece: Piece,
  fromRow: number, fromCol: number,
  toRow: number, toCol: number
): string {
  // For each other piece of the same type and color, check if it could
  // legally move to (toRow, toCol). If so, we need disambiguation.
  let needFile = false;
  let needRank = false;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === fromRow && c === fromCol) continue;
      const other = board[r][c];
      if (!other) continue;
      if (other.pieceType !== movingPiece.pieceType) continue;
      if (other.color !== movingPiece.color) continue;

      // Check if this other piece can legally move to (toRow, toCol)
      if (canPieceMoveTo(board, other, r, c, toRow, toCol)) {
        if (c !== fromCol) needFile = true;
        else needRank = true;
      }
    }
  }

  if (needFile && needRank) {
    const fromFile = String.fromCharCode('a'.charCodeAt(0) + fromCol);
    const fromRank = (fromRow + 1).toString();
    return fromFile + fromRank;
  } else if (needFile) {
    return String.fromCharCode('a'.charCodeAt(0) + fromCol);
  } else if (needRank) {
    return (fromRow + 1).toString();
  }
  return '';
}
```

### 7.4 PGN Assembly

```typescript
async function buildPgn(
  db: Pool,
  matchId: string,
  siteUrl: string
): Promise<string> {
  // Fetch match metadata
  const matchResult = await db.query(
    'SELECT * FROM matches WHERE match_id = $1',
    [matchId]
  );
  const match = matchResult.rows[0];
  if (!match) throw new Error('Match not found');

  // Fetch moves
  const movesResult = await db.query(
    'SELECT * FROM moves WHERE match_id = $1 ORDER BY move_number ASC',
    [matchId]
  );
  const moves = movesResult.rows;

  // Determine result
  const resultMap: Record<string, string> = {
    WhiteWins: '1-0',
    BlackWins: '0-1',
    Draw: '1/2-1/2',
  };
  const result = resultMap[match.game_status] || '*';

  // PGN header tags
  const date = new Date(match.created_at).toISOString().slice(0, 10).replace(/-/g, '.');
  const timeControl = `${match.move_timeout_seconds}+0`;

  let pgn = '';
  pgn += `[Event "Magic Speed Chess"]\n`;
  pgn += `[Site "${siteUrl}"]\n`;
  pgn += `[Date "${date}"]\n`;
  pgn += `[Round "-"]\n`;
  pgn += `[White "${match.white_player}"]\n`;
  pgn += `[Black "${match.black_player || '?'}"]\n`;
  pgn += `[Result "${result}"]\n`;
  pgn += `[TimeControl "${timeControl}"]\n`;
  pgn += `[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n`;
  pgn += '\n';

  // Movetext (grouped by full-move number)
  const formattedMoves: string[] = [];
  let currentMoveNum = 0;
  let currentLine = '';

  for (const move of moves) {
    const moveNum = Math.ceil(move.move_number / 2); // 1-based full move number

    if (moveNum !== currentMoveNum) {
      if (currentLine) formattedMoves.push(currentLine.trim());
      currentMoveNum = moveNum;
      currentLine = `${moveNum}.`;
    }

    // Convert algebraic_move (coordinate format) to SAN
    // In production, we'd store SAN alongside the coordinate move, or compute it here
    currentLine += ` ${move.algebraic_move}`; // Simplified: use coordinate format
  }

  if (currentLine) formattedMoves.push(currentLine.trim());

  pgn += formattedMoves.join(' ');
  pgn += ` ${result}`;

  return pgn;
}
```

---

## 8. Redis Caching Strategy

### 8.1 Key Schema

```
Key Pattern                          Type          TTL                Purpose
─────────────────────────────────────────────────────────────────────────────────
match:{matchId}                      String(JSON)  1h after game end  Full match JSON (API cache)
match:{matchId}:board                String(JSON)  Duration of game    Current board state (Position)
match:{matchId}:fen                  String        Duration of game    Current FEN string
match:{matchId}:moves                List(JSON)    1h after game end  Recent moves for quick lookup
lobby:joinable                       Sorted Set    No TTL             Match IDs scored by created_at
leaderboard:wins:daily               Sorted Set    24h                Player pubkeys scored by wins
leaderboard:wins:weekly              Sorted Set    7d                 Player pubkeys scored by wins
leaderboard:elo                      Sorted Set    1h                 Player pubkeys scored by ELO
active:match:connections:{matchId}   Set            Duration of game  WebSocket connection IDs for broadcasting
rate:limit:{ip}                      String        60s                Rate limit counter per IP
```

### 8.2 Cache Population & Invalidation

```typescript
// On MatchCreatedEvent
await redis.set(`match:${matchId}`, JSON.stringify(matchRecord), 'EX', 3600);
await redis.set(`match:${matchId}:board`, JSON.stringify(initialBoard));
await redis.set(`match:${matchId}:fen`, initialFen);
await redis.zadd('lobby:joinable', Date.now(), matchId);

// On PlayerJoinedEvent
await redis.zrem('lobby:joinable', matchId);
await redis.set(`match:${matchId}`, JSON.stringify(updatedMatch), 'EX', 3600);

// On MoveMadeEvent
await redis.set(`match:${matchId}:board`, JSON.stringify(newBoard));
await redis.set(`match:${matchId}:fen`, newFen);
await redis.rpush(`match:${matchId}:moves`, JSON.stringify(moveRecord));

// On GameEndedEvent
await redis.del(`match:${matchId}:board`); // or expire to 1h
await redis.del(`match:${matchId}:fen`);
await redis.set(`match:${matchId}`, JSON.stringify(finalMatch), 'EX', 3600);
```

### 8.3 Leaderboard Updates

```typescript
async function updateLeaderboardCache(redis: Redis, playerPubkey: string, wins: number): Promise<void> {
  // Daily leaderboard
  const today = new Date().toISOString().slice(0, 10);
  await redis.zincrby(`leaderboard:daily:${today}`, wins, playerPubkey);
  await redis.expire(`leaderboard:daily:${today}`, 86400);

  // Weekly leaderboard
  await redis.zincrby('leaderboard:weekly', wins, playerPubkey);
}
```

---

## 9. Crank Worker Design

### 9.1 Purpose

The crank worker periodically checks for active matches where the opponent has exceeded the per-move timeout and calls `claim_timeout_win` on the Solana program. Without a crank, timeouts are only detected when the non-timed-out player manually calls `claim_timeout_win`.

### 9.2 Trigger

A 30-second interval timer (setInterval or cron). The exact interval matters: too short wastes RPC calls; too long makes timeout detection laggy. 30 seconds is a good balance for a per-move timeout that is typically 300-900 seconds.

### 9.3 Pseudocode

```typescript
// backend/src/workers/crank.ts

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as anchor from '@coral-xyz/anchor';
// Import IDL and program types

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const CRANK_KEYPAIR = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(process.env.CRANK_PRIVATE_KEY!))
);
const CRANK_INTERVAL_MS = 30_000; // 30 seconds
const BATCH_SIZE = 10;           // Max timeouts to claim per tick

interface ExpiredMatch {
  matchId: string;
  currentTurn: string; // 'White' or 'Black'
  timedOutPlayer: string;
}

async function findExpiredMatches(db: Pool): Promise<ExpiredMatch[]> {
  const result = await db.query(`
    SELECT match_id, game_status
    FROM matches
    WHERE game_status = 'Active'
      AND move_timeout_seconds > 0
      AND EXTRACT(epoch FROM NOW()) - EXTRACT(epoch FROM last_move_at) > move_timeout_seconds
    LIMIT $1
  `, [BATCH_SIZE]);

  return result.rows.map(row => {
    // We also need to know whose turn it is (the player who has timed out)
    // This info is NOT in the matches table directly; we can derive from the
    // last move, or query the Redis FEN cache
    return {
      matchId: row.match_id,
      currentTurn: '?', // Will be resolved below
      timedOutPlayer: '?',
    };
  });
}

async function resolveTimedOutPlayer(
  redis: Redis,
  match: { matchId: string }
): Promise<{ currentTurn: string; timedOutPubkey: string }> {
  // Option A: Parse from FEN cache (active color field)
  const fen = await redis.get(`match:${match.matchId}:fen`);
  if (!fen) {
    throw new Error(`FEN not cached for active match ${match.matchId}`);
  }
  const fenParts = fen.split(' ');
  const activeColor = fenParts[1]; // 'w' or 'b'

  return {
    currentTurn: activeColor === 'w' ? 'White' : 'Black',
    timedOutPubkey: activeColor === 'w' ? 'white_player_pubkey_here' : 'black_player_pubkey_here',
  };
}

async function claimTimeoutWin(
  connection: Connection,
  program: anchor.Program,
  matchId: string
): Promise<string> {
  // Build and send the claim_timeout_win transaction
  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('chess_match'), Buffer.from(matchId)],
    PROGRAM_ID
  );

  const tx = await program.methods
    .claimTimeoutWin()
    .accounts({
      chessMatch: chessMatchPda,
      claimerSigner: CRANK_KEYPAIR.publicKey,
    })
    .signers([CRANK_KEYPAIR])
    .rpc({ commitment: 'confirmed' });

  return tx;
}

async function checkTimeouts(
  db: Pool,
  redis: Redis,
  connection: Connection,
  program: anchor.Program
): Promise<{ checked: number; claimed: number; errors: number }> {
  let claimed = 0;
  let errors = 0;

  const expired = await findExpiredMatches(db);
  const checked = expired.length;

  for (const match of expired) {
    try {
      // Resolve which player timed out
      const { timedOutPubkey } = await resolveTimedOutPlayer(redis, match);

      // Verify that the timed-out player is NOT the crank signer
      // (the crank cannot claim timeouts against itself)
      if (timedOutPubkey === CRANK_KEYPAIR.publicKey.toBase58()) {
        console.log(`Skipping match ${match.matchId}: crank would be claiming against itself`);
        continue;
      }

      const signature = await claimTimeoutWin(connection, program, match.matchId);
      console.log(`Timeout claimed for match ${match.matchId}: ${signature}`);
      claimed++;
    } catch (err) {
      console.error(`Failed to claim timeout for match ${match.matchId}:`, err);
      errors++;
    }
  }

  return { checked, claimed, errors };
}

// Start the crank loop
export function startCrankWorker(
  db: Pool,
  redis: Redis,
  connection: Connection,
  program: anchor.Program
): NodeJS.Timeout {
  console.log('Crank worker started (interval: 30s)');

  const interval = setInterval(async () => {
    try {
      const result = await checkTimeouts(db, redis, connection, program);
      if (result.checked > 0 || result.claimed > 0) {
        console.log(`Crank tick: checked=${result.checked} claimed=${result.claimed} errors=${result.errors}`);
      }
    } catch (err) {
      console.error('Crank worker error:', err);
    }
  }, CRANK_INTERVAL_MS);

  return interval;
}
```

### 9.4 Why the Crank Signs a Transaction

The crank's `claimer_signer` account on-chain is checked against the match's players. The on-chain instruction requires:

```rust
require!(chess_match.game_status == GameStatus::Active, ...);
require!(claimer_key == chess_match.players[0] || claimer_key == chess_match.players[1], ...);
require!(chess_match.current_turn == opponent_color, ...);
require!(time_since_last_move > chess_match.move_timeout_duration, ...);
```

This means the crank signer MUST be one of the two players. A separate "crank PDA" won't work with the current program design unless we modify the program to allow a trusted crank authority.

**Design decisions for the crank:**

1. **Simplest (current)**: The crank private key is one of the player keypairs. This only works for testing. Not viable for production.

2. **Better (recommended)**: Modify `claim_timeout_win` to accept a `crank_authority` account. The crank is a known pubkey authorized to call this instruction on behalf of timed-out victims. Add a `crank_authority` field to the `ClaimTimeoutWin` accounts and an additional constraint:
   ```rust
   constraint = claimer_signer.key() == chess_match.players[0]
             || claimer_signer.key() == chess_match.players[1]
             || claimer_signer.key() == crank_authority.key()
   ```
   The crank can then claim timeouts impartially for any match.

3. **Best (Phase 2)**: MagicBlock session keys. Players delegate a session key that the crank uses to auto-claim timeouts gaslessly.

For hackathon MVP, the crank is optional -- players can manually call `claim_timeout_win` when their opponent times out. The crank is Phase 2 infrastructure.

---

## 10. SDK Chess Utilities

### 10.1 File: `sdk/src/utils/chess.ts`

This file is a **pure TypeScript module** with zero dependencies. It should be usable in browser, Node.js, and React Native environments.

```typescript
// sdk/src/utils/chess.ts

// ============================================================================
// TYPES (mirroring Anchor program enums and structs)
// ============================================================================

export enum PieceType { Pawn, Knight, Bishop, Rook, Queen, King }
export enum PlayerColor { White, Black }

export interface Piece {
  pieceType: PieceType;
  color: PlayerColor;
}

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

export interface EnPassantSquare {
  row: number; // 0-7
  col: number; // 0-7
}

export interface ChessPosition {
  board: (Piece | null)[][];
  currentTurn: PlayerColor;
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

// Simplified position type with string fields (for JSON/API usage)
export interface FenPosition {
  board: (Piece | null)[][];
  currentTurn: 'w' | 'b';
  castlingRights: string;     // e.g., "KQkq"
  enPassantTarget: string | null; // e.g., "e3"
  halfmoveClock: number;
  fullmoveNumber: number;
}

// Move input type (mirrors on-chain MakeMoveArgs)
export interface MakeMoveArgs {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotion: PieceType | null;
}

// Recorded move with metadata
export interface MoveRecord {
  moveNumber: number;
  player: string;           // pubkey
  playerColor: PlayerColor;
  algebraicMove: string;    // coordinate format: "e2e4", "e7e8q"
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotionPiece: PieceType | null;
  fenAfter: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PIECE_TO_FEN_CHAR: Record<PieceType, { white: string; black: string }> = {
  [PieceType.King]:   { white: 'K', black: 'k' },
  [PieceType.Queen]:  { white: 'Q', black: 'q' },
  [PieceType.Rook]:   { white: 'R', black: 'r' },
  [PieceType.Bishop]: { white: 'B', black: 'b' },
  [PieceType.Knight]: { white: 'N', black: 'n' },
  [PieceType.Pawn]:   { white: 'P', black: 'p' },
};

const FEN_CHAR_TO_PIECE: Record<string, { pieceType: PieceType; color: PlayerColor }> = {
  'K': { pieceType: PieceType.King,   color: PlayerColor.White },
  'Q': { pieceType: PieceType.Queen,  color: PlayerColor.White },
  'R': { pieceType: PieceType.Rook,   color: PlayerColor.White },
  'B': { pieceType: PieceType.Bishop, color: PlayerColor.White },
  'N': { pieceType: PieceType.Knight, color: PlayerColor.White },
  'P': { pieceType: PieceType.Pawn,   color: PlayerColor.White },
  'k': { pieceType: PieceType.King,   color: PlayerColor.Black },
  'q': { pieceType: PieceType.Queen,  color: PlayerColor.Black },
  'r': { pieceType: PieceType.Rook,   color: PlayerColor.Black },
  'b': { pieceType: PieceType.Bishop, color: PlayerColor.Black },
  'n': { pieceType: PieceType.Knight, color: PlayerColor.Black },
  'p': { pieceType: PieceType.Pawn,   color: PlayerColor.Black },
};

const BACK_RANK_ORDER: PieceType[] = [
  PieceType.Rook, PieceType.Knight, PieceType.Bishop, PieceType.Queen,
  PieceType.King, PieceType.Bishop, PieceType.Knight, PieceType.Rook,
];

// ============================================================================
// FEN SERIALIZATION: Board -> FEN
// ============================================================================

export function boardToFen(position: ChessPosition): string {
  // 1. Piece placement (rows 7 -> 0)
  const ranks: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let rankStr = '';
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = position.board[row][col];
      if (piece === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount.toString();
          emptyCount = 0;
        }
        rankStr += PIECE_TO_FEN_CHAR[piece.pieceType][
          piece.color === PlayerColor.White ? 'white' : 'black'
        ];
      }
    }
    if (emptyCount > 0) rankStr += emptyCount.toString();
    ranks.push(rankStr);
  }
  const piecePlacement = ranks.join('/');

  // 2. Active color
  const activeColor = position.currentTurn === PlayerColor.White ? 'w' : 'b';

  // 3. Castling availability
  let castling = '';
  if (position.castlingRights.whiteKingside)  castling += 'K';
  if (position.castlingRights.whiteQueenside) castling += 'Q';
  if (position.castlingRights.blackKingside)  castling += 'k';
  if (position.castlingRights.blackQueenside) castling += 'q';
  if (castling === '') castling = '-';

  // 4. En passant target
  let enPassant = '-';
  if (position.enPassantTarget !== null) {
    const file = String.fromCharCode('a'.charCodeAt(0) + position.enPassantTarget.col);
    const rank = (position.enPassantTarget.row + 1).toString();
    enPassant = `${file}${rank}`;
  }

  return `${piecePlacement} ${activeColor} ${castling} ${enPassant} ${position.halfmoveClock} ${position.fullmoveNumber}`;
}

// ============================================================================
// FEN PARSING: FEN -> Board
// ============================================================================

const FEN_REGEX =
  /^([rnbqkpRNBQKP1-8]{1,8}\/(?:[rnbqkpRNBQKP1-8]{1,8}\/){6}[rnbqkpRNBQKP1-8]{1,8})\s+([wb])\s+(K?Q?k?q?|-)\s+([a-h][1-8]|-)\s+(\d+)\s+(\d+)$/;

export function fenToBoard(fen: string): ChessPosition {
  const trimmed = fen.trim();
  const match = trimmed.match(FEN_REGEX);

  if (!match) {
    throw new Error(`Invalid FEN string: "${trimmed}"`);
  }

  const [, piecePlacement, activeColor, castlingStr, enPassantStr,
         halfmoveStr, fullmoveStr] = match;

  // Parse piece placement
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );

  const rankStrings = piecePlacement.split('/');
  for (let fenRankIdx = 0; fenRankIdx < 8; fenRankIdx++) {
    const boardRow = 7 - fenRankIdx;
    const rankStr = rankStrings[fenRankIdx];
    let boardCol = 0;

    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        boardCol += parseInt(ch, 10);
      } else {
        const pieceDef = FEN_CHAR_TO_PIECE[ch];
        if (!pieceDef) throw new Error(`Unknown piece character in FEN: "${ch}"`);
        board[boardRow][boardCol] = {
          pieceType: pieceDef.pieceType,
          color: pieceDef.color,
        };
        boardCol++;
      }
    }
  }

  return {
    board,
    currentTurn: activeColor === 'w' ? PlayerColor.White : PlayerColor.Black,
    castlingRights: {
      whiteKingside:  castlingStr.includes('K'),
      whiteQueenside: castlingStr.includes('Q'),
      blackKingside:  castlingStr.includes('k'),
      blackQueenside: castlingStr.includes('q'),
    },
    enPassantTarget: parseEnPassant(enPassantStr),
    halfmoveClock: parseInt(halfmoveStr, 10),
    fullmoveNumber: parseInt(fullmoveStr, 10),
  };
}

function parseEnPassant(ep: string): EnPassantSquare | null {
  if (ep === '-') return null;
  const col = ep.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(ep[1], 10) - 1;
  return { row, col };
}

// ============================================================================
// BOARD INITIALIZATION
// ============================================================================

export function initializeChessBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );

  for (let col = 0; col < 8; col++) {
    board[1][col] = { pieceType: PieceType.Pawn, color: PlayerColor.White };
    board[6][col] = { pieceType: PieceType.Pawn, color: PlayerColor.Black };
  }

  for (let col = 0; col < 8; col++) {
    board[0][col] = { pieceType: BACK_RANK_ORDER[col], color: PlayerColor.White };
    board[7][col] = { pieceType: BACK_RANK_ORDER[col], color: PlayerColor.Black };
  }

  return board;
}

export function defaultPosition(): ChessPosition {
  return {
    board: initializeChessBoard(),
    currentTurn: PlayerColor.White,
    castlingRights: {
      whiteKingside: true, whiteQueenside: true,
      blackKingside: true, blackQueenside: true,
    },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

// ============================================================================
// COORDINATE UTILITIES
// ============================================================================

/** Convert (row, col) to algebraic notation: "a1" through "h8" */
export function squareToAlgebraic(row: number, col: number): string {
  const file = String.fromCharCode('a'.charCodeAt(0) + col);
  const rank = (row + 1).toString();
  return `${file}${rank}`;
}

/** Convert algebraic notation to (row, col) */
export function algebraicToSquare(sq: string): { row: number; col: number } {
  const col = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(sq[1], 10) - 1;
  return { row, col };
}

// ============================================================================
// STANDARD ALGEBRAIC NOTATION (SAN)
// ============================================================================

export function toSan(
  board: (Piece | null)[][],
  fromRow: number, fromCol: number,
  toRow: number, toCol: number,
  promotionPiece: PieceType | null,
  isCheck: boolean,
  isCheckmate: boolean
): string {
  const piece = board[fromRow][fromCol];
  if (!piece) throw new Error('No piece at source square');

  const toFile = String.fromCharCode('a'.charCodeAt(0) + toCol);
  const toRank = (toRow + 1).toString();
  const toSquare = `${toFile}${toRank}`;
  const fromFile = String.fromCharCode('a'.charCodeAt(0) + fromCol);
  const isCapture = board[toRow][toCol] !== null;

  const pieceLetterMap: Record<PieceType, string> = {
    [PieceType.King]: 'K', [PieceType.Queen]: 'Q', [PieceType.Rook]: 'R',
    [PieceType.Bishop]: 'B', [PieceType.Knight]: 'N', [PieceType.Pawn]: '',
  };

  let moveStr = '';

  // Castling
  if (piece.pieceType === PieceType.King && Math.abs(toCol - fromCol) === 2) {
    moveStr = toCol > fromCol ? 'O-O' : 'O-O-O';
  }
  // Pawn moves
  else if (piece.pieceType === PieceType.Pawn) {
    if (isCapture) {
      moveStr = `${fromFile}x${toSquare}`;
    } else {
      moveStr = toSquare;
    }
    if (promotionPiece && promotionPiece !== PieceType.Pawn) {
      const promoChar = PIECE_TO_FEN_CHAR[promotionPiece].white;
      moveStr += `=${promoChar}`;
    }
  }
  // Piece moves
  else {
    const pLetter = pieceLetterMap[piece.pieceType];
    const disambig = getDisambiguation(board, piece, fromRow, fromCol, toRow, toCol);
    moveStr = pLetter + disambig;
    if (isCapture) moveStr += 'x';
    moveStr += toSquare;
  }

  if (isCheckmate) moveStr += '#';
  else if (isCheck) moveStr += '+';

  return moveStr;
}

function getDisambiguation(
  board: (Piece | null)[][],
  movingPiece: Piece,
  fromRow: number, fromCol: number,
  toRow: number, toCol: number
): string {
  let needFile = false;
  let needRank = false;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === fromRow && c === fromCol) continue;
      const other = board[r][c];
      if (!other) continue;
      if (other.pieceType !== movingPiece.pieceType) continue;
      if (other.color !== movingPiece.color) continue;

      // Simplified: check if this other piece could reach the target
      if (canPieceReach(board, other, r, c, toRow, toCol)) {
        if (c !== fromCol) needFile = true;
        else needRank = true;
      }
    }
  }

  if (needFile && needRank) {
    return `${String.fromCharCode('a'.charCodeAt(0) + fromCol)}${fromRow + 1}`;
  } else if (needFile) {
    return String.fromCharCode('a'.charCodeAt(0) + fromCol);
  } else if (needRank) {
    return (fromRow + 1).toString();
  }
  return '';
}

/** Quick check: can a piece reach a square based on piece type, ignoring path blockers */
function canPieceReach(
  _board: (Piece | null)[][],
  piece: Piece,
  fromRow: number, fromCol: number,
  toRow: number, toCol: number
): boolean {
  const dr = Math.abs(toRow - fromRow);
  const dc = Math.abs(toCol - fromCol);

  switch (piece.pieceType) {
    case PieceType.Knight: return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    case PieceType.Bishop: return dr === dc && dr > 0;
    case PieceType.Rook:   return (dr === 0 || dc === 0) && (dr + dc > 0);
    case PieceType.Queen:  return (dr === dc || dr === 0 || dc === 0) && (dr + dc > 0);
    case PieceType.King:   return dr <= 1 && dc <= 1 && (dr + dc > 0);
    case PieceType.Pawn: {
      const dir = piece.color === PlayerColor.White ? 1 : -1;
      return toRow - fromRow === dir && dc <= 1;
    }
    default: return false;
  }
}

// ============================================================================
// PGN EXPORT
// ============================================================================

export interface PgnInput {
  whitePlayer: string;
  blackPlayer: string | null;
  date: string;            // "YYYY.MM.DD"
  result: string;          // "1-0", "0-1", "1/2-1/2", "*"
  timeControl: string;     // "900+0"
  moves: MoveRecord[];
}

export function buildPgn(input: PgnInput): string {
  let pgn = '';
  pgn += `[Event "Magic Speed Chess"]\n`;
  pgn += `[Site "https://app.speedchess.xyz"]\n`;
  pgn += `[Date "${input.date}"]\n`;
  pgn += `[Round "-"]\n`;
  pgn += `[White "${input.whitePlayer}"]\n`;
  pgn += `[Black "${input.blackPlayer || '?'}"]\n`;
  pgn += `[Result "${input.result}"]\n`;
  pgn += `[TimeControl "${input.timeControl}"]\n`;
  pgn += '\n';

  // Movetext
  const lines: string[] = [];
  let currentMoveNum = 0;
  let currentLine = '';

  for (const move of input.moves) {
    const fullMoveNum = Math.ceil(move.moveNumber / 2);
    if (fullMoveNum !== currentMoveNum) {
      if (currentLine) lines.push(currentLine.trim());
      currentMoveNum = fullMoveNum;
      currentLine = `${fullMoveNum}.`;
    }
    currentLine += ` ${move.algebraicMove}`;
  }
  if (currentLine) lines.push(currentLine.trim());

  pgn += lines.join(' ') + ` ${input.result}`;
  return pgn;
}
```

---

## 11. Shared Package Strategy

### 11.1 Problem

The pure chess utility functions (FEN serialization, FEN parsing, board initialization, SAN generation) are needed in both:
- `sdk/src/utils/chess.ts` (frontend, React Native, CLI tools)
- `backend/src/utils/fen.ts` (server-side webhook handler, API responses)

Duplicating code is a maintenance risk: fixing a bug in one copy requires manually syncing the other.

### 11.2 Solution Options

| Option | Description | Complexity | Best For |
|--------|-------------|------------|----------|
| **A. Monorepo internal package** | Create `packages/chess-utils/` as a workspace member. Both `sdk/` and `backend/` depend on it. | Medium | Shared code grows (legal move generation, check detection, etc.) |
| **B. Copy + CI check** | Keep two copies; add a CI test that verifies function signatures are identical. | Low | Stable code that rarely changes |
| **C. Single source file, symlinked** | Keep `sdk/src/utils/chess.ts` as the single source. `backend/src/utils/fen.ts` is a symlink or copies at build time. | Minimal | Quick MVP |

### 11.3 Recommendation: Option A (Monorepo Internal Package)

```
magic-speed-chess/
├── packages/
│   └── chess-utils/
│       ├── package.json          { "name": "@magicspeedchess/chess-utils" }
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          // Re-exports everything
│           ├── types.ts          // PieceType, PlayerColor, ChessPosition, etc.
│           ├── fen.ts            // boardToFen, fenToBoard
│           ├── board.ts          // initializeChessBoard, defaultPosition
│           ├── notation.ts       // toSan, squareToAlgebraic, algebraicToSquare
│           └── move.ts           // applyMoveToBoard (for backend board cache)
├── sdk/
│   └── package.json              { "dependencies": { "@magicspeedchess/chess-utils": "workspace:*" } }
├── backend/
│   └── package.json              { "dependencies": { "@magicspeedchess/chess-utils": "workspace:*" } }
└── package.json                  { "workspaces": ["packages/*", "sdk", "backend"] }
```

This gives:
- Zero duplication
- Type-safe sharing
- Independent versioning
- Tree-shakeable (consumers import only what they need)
- CI can run dedicated tests for `chess-utils/` alone

### 11.4 What Lives in `packages/chess-utils/`

| Module         | Exports                                                                 |
|----------------|-------------------------------------------------------------------------|
| `types.ts`     | `PieceType`, `PlayerColor`, `Piece`, `CastlingRights`, `EnPassantSquare`, `ChessPosition`, `FenPosition`, `MakeMoveArgs`, `MoveRecord` |
| `fen.ts`       | `boardToFen()`, `fenToBoard()`, `fenToFenPosition()`                    |
| `board.ts`     | `initializeChessBoard()`, `defaultPosition()`                           |
| `notation.ts`  | `toSan()`, `squareToAlgebraic()`, `algebraicToSquare()`                 |
| `move.ts`      | `applyMoveToBoard()` (for backend), `isKingInCheck()` (basic check detection, future) |
| `pgn.ts`       | `buildPgn()`                                                            |

---

## Appendix A: Environment Variables

```bash
# backend/.env.example
DATABASE_URL=postgresql://user:password@localhost:5432/magic_speed_chess
REDIS_URL=redis://localhost:6379
HELIUS_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
PROGRAM_ID=9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9
RPC_URL=https://api.devnet.solana.com
CRANK_PRIVATE_KEY=[1,2,3,...]  # optional, for crank worker
APP_URL=https://app.speedchess.xyz
CORS_ORIGIN=https://app.speedchess.xyz
PORT=3000
```

## Appendix B: Project Structure (with Backend)

```
magic-speed-chess/
├── packages/
│   └── chess-utils/               # Shared TypeScript chess utilities package
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── fen.ts
│           ├── board.ts
│           ├── notation.ts
│           ├── move.ts
│           └── pgn.ts
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app.ts                 # Fastify app setup
│   │   ├── config.ts              # Env var validation
│   │   ├── db/
│   │   │   ├── pool.ts            # Postgres connection pool
│   │   │   └── migrations/        # SQL migration files
│   │   │       ├── 001_create_matches.sql
│   │   │       ├── 002_create_moves.sql
│   │   │       ├── 003_create_player_stats.sql
│   │   │       ├── 004_create_elo_history.sql
│   │   │       └── 005_create_webhook_events.sql
│   │   ├── routes/
│   │   │   ├── webhooks.ts        # Helius webhook handler
│   │   │   ├── matches.ts         # GET /api/matches/*
│   │   │   ├── players.ts         # GET /api/players/*
│   │   │   └── leaderboard.ts     # GET /api/leaderboard
│   │   ├── services/
│   │   │   ├── boardCache.ts      # In-memory + Redis board cache
│   │   │   ├── fenService.ts      # FEN computation using chess-utils
│   │   │   └── pgnService.ts      # PGN export service
│   │   ├── workers/
│   │   │   └── crank.ts           # Timeout detection worker
│   │   └── websocket/
│   │       └── gateway.ts         # WebSocket gateway for real-time updates
│   └── tests/
│       ├── fen.test.ts            # FEN roundtrip tests
│       ├── pgn.test.ts            # PGN export tests
│       └── webhook.test.ts        # Webhook processing tests
├── sdk/
│   └── src/
│       └── utils/
│           └── chess.ts           # Re-exports from @magicspeedchess/chess-utils
├── anchor/                        # Solana program (unchanged)
└── src/                           # Next.js frontend (unchanged)
```
