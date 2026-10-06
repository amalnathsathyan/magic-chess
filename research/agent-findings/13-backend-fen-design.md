# Agent 13: Backend + FEN Design

## Status: ✅ Complete — `BACKEND_DESIGN.md` written (2,701 lines)

### FEN Strategy: Option C — Server-Side Board Cache

Backend maintains cached board state per match. On each `MoveMadeEvent`: apply move to cached board → compute FEN → store in DB → publish to Redis.

**Why**: Avoids re-fetching full ChessMatch account on every move. Board can be rebuilt from move history on server restart.

### FEN Utilities (Shared `packages/chess-utils`)
```typescript
function boardToFen(position: ChessPosition): string;   // Board → FEN
function fenToBoard(fen: string): ChessPosition;          // FEN → Board
function algebraicNotation(move: MoveArgs): string;      // e2e4 → "e4"
function toSan(move: MoveArgs, board: Board): string;    // With disambiguation
function buildPgn(match: MatchState, moves: MoveRecord[]): string;
```

### Database: Full Schema
- `matches` — indexed by status (joinable), player pubkeys, active timeout
- `moves` — composite PK (match_id, move_number), `fen_after_move` column, unique on event_signature
- `player_stats` — ELO rating, win/loss/draw counts
- `elo_history` — time-series rating changes
- `webhook_events` — raw event log for idempotency + replay

### Helius Webhook Handler
```
POST /api/webhooks/helius
→ Parse event type from Anchor discriminator
→ Upsert into Postgres
→ Publish to Redis channel
→ Return 200 (idempotent by event_signature UNIQUE constraint)
```

### Redis Cache Keys
```
match:{id}             → Full JSON (TTL: 1h after end)
match:{id}:board       → Board state (TTL: game duration)
match:{id}:fen         → FEN string (TTL: game duration)
lobby:joinable         → Sorted set by created_at (no TTL)
leaderboard:daily      → Sorted set (TTL: 24h)
```

### PGN Export
Standard PGN format with tag pairs + movetext. SAN notation with disambiguation, check/checkmate symbols (`+`, `#`), and result (`1-0`, `0-1`, `1/2-1/2`).

### Crank Worker
```typescript
// Every 30 seconds
const expired = await db.query(`
  SELECT match_id FROM matches
  WHERE game_status = 'Active'
    AND (EXTRACT(epoch FROM NOW()) - last_move_timestamp) > move_timeout_duration
`);
// For each: call claim_timeout_win on Solana program
```
