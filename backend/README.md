# Magic Chess Backend

Fastify + TypeScript + Supabase PostgreSQL. Indexes on-chain chess matches, serves match history, leaderboards, and player profiles.

## Quick Start

```bash
cp .env.example .env
# Fill in DATABASE_URL from Supabase dashboard
npm install
npm run migrate   # Create tables
npm run dev       # Start on :3001
```

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Server | Fastify 5 + TypeScript | Fast, typed |
| DB | Supabase PostgreSQL | Free tier, built-in Realtime |
| DB driver | `postgres` npm | Direct connection, lightweight |
| Indexing | Client-driven sync | Frontend calls `/api/sync/*` after on-chain tx confirms |
| Realtime | Supabase Realtime | Frontend subscribes to DB changes via WebSocket |

## API

### Matches
- `GET /api/matches` — list matches (filterable by status, player)
- `GET /api/matches/:id` — single match + FEN
- `GET /api/matches/:id/history` — move history with FEN per move

### Players
- `GET /api/players/:pubkey/stats` — win/loss/draw, streaks, amounts
- `GET /api/players/:pubkey/matches` — paginated match history

### Leaderboard
- `GET /api/leaderboard?sortBy=wins|winRate|totalGames`

### Sync (frontend → backend)
- `POST /api/sync/match-created`
- `POST /api/sync/player-joined`
- `POST /api/sync/move-made`
- `POST /api/sync/game-ended`
- `POST /api/sync/payout`

### Health
- `GET /api/health`

## Architecture

```
Frontend ──SDK──> Solana Chain (devnet)
    │                    │
    │ POST /api/sync/*   │ events
    ▼                    │
Backend ──verify──> Solana RPC
    │
    │ write
    ▼
Supabase PostgreSQL ──Realtime──> Frontend (subscribe)
```

## Env

```
DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
RPC_ENDPOINT=https://api.devnet.solana.com
PROGRAM_ID=FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## What was skipped

- **Redis** — Supabase Realtime covers pub/sub. Add if WebSocket fan-out becomes a bottleneck.
- **Helius webhooks** — Client-driven sync simpler for MVP. Add webhooks for production reliability.
- **Crank worker** — Manual timeout claiming works. Add when automated timeout enforcement needed.
- **ELO table** — Schema ready but not populated. Add when rating system launches.
- **PGN export** — Move history endpoint has all data needed. Add PGN formatting endpoint on demand.
