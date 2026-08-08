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
| Indexing | Trusted sync ingestion | A server-side indexer/webhook calls `/api/sync/*` after confirmation |
| Realtime | Server-Sent Events | Signed player presence, spectators, replay/resync, shared clock |

## API

### Matches
- `GET /api/matches` — list matches (filterable by status, player)
- `GET /api/matches/:id` — single match + FEN
- `GET /api/matches/:id/history` — move history with FEN per move

### Lobby and realtime

- `GET /api/lobbies` — open matches from the confirmed on-chain index
- `GET /api/realtime/matches/:id/challenge?wallet=<pubkey>` — exact player message to sign
- `POST /api/realtime/matches/:id/session` — create a player or spectator session
- `GET /api/realtime/matches/:id/events?session=<token>` — SSE stream used by players and spectators

The shareable browser URL remains `/play/:id`. Every browser on that page creates
its own realtime session. Spectators post `{}`. A player first fetches the
challenge, signs the returned UTF-8 `message` with the wallet, then posts:

```json
{
  "wallet": "player base58 pubkey",
  "issuedAt": 1786250000000,
  "signature": "base64 Ed25519 signature over the exact challenge message",
  "clientId": "optional stable browser-tab id"
}
```

The response includes `role`, `snapshot`, `expiresAt`, and `eventUrl`. Open
`eventUrl` with `EventSource`. Browser reconnects automatically include the last
event ID, allowing the server to replay its bounded event buffer. If the buffer
has expired the stream sends `resync.required` followed by `match.snapshot`.

SSE event names:

- `session.ready` — assigned role and connection details
- `presence.sync` — online state for white/black plus spectator count
- `match.notification` — create, join, move, end, abort, and payout notifications
- `match.snapshot` — full confirmed indexed match state
- `clock.tick` — shared active-color deadline and server-derived remaining time

The clock is a display/countdown authority for connected clients, derived from
the confirmed transaction block time and the on-chain per-move timeout. Timeout
claims and final game state are still enforced by the Solana program. The hub
also reloads connected matches from PostgreSQL every three seconds, so a missed
in-process notification is repaired with a snapshot.

### Players
- `GET /api/players/:pubkey/stats` — win/loss/draw, streaks, amounts
- `GET /api/players/:pubkey/matches` — paginated match history

### Leaderboard
- `GET /api/leaderboard?sortBy=wins|winRate|totalGames`

### Sync (trusted indexer/webhook → backend)
- `POST /api/sync/match-created`
- `POST /api/sync/player-joined`
- `POST /api/sync/match-aborted`
- `POST /api/sync/move-made`
- `POST /api/sync/game-ended`
- `POST /api/sync/payout`

Every sync request uses `X-API-Key` and this JSON body:

```json
{
  "matchId": "mc-example",
  "signature": "base58-transaction-signature",
  "runtimeEndpoint": "https://devnet-as.magicblock.app",
  "eventIndex": 12
}
```

`runtimeEndpoint` is omitted for base-layer events. Include the router-resolved
ER endpoint for ER events, especially delayed retries after undelegation. The
backend accepts only HTTPS `*.magicblock.app` endpoints, fetches the confirmed
transaction, scopes logs to this program, and decodes the expected Anchor event;
request bodies cannot supply indexed wager, player, move, status, FEN, or payout
values. `eventIndex` is the zero-based transaction log index and is only required
when one transaction contains multiple matching events for the same match.

### Health
- `GET /api/health`

## Architecture

```
Frontend ──SDK──> Solana L1 / MagicBlock ER
    │                    │ confirmed program events
    │ SSE                ▼
    └──── Backend ◄── Trusted indexer
            │            X-API-Key + verified transaction
            │ write/read
            ▼
     Supabase PostgreSQL
```

## Env

```
DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
RPC_ENDPOINT=https://api.devnet.solana.com
PROGRAM_ID=FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
PORT=3001
CORS_ORIGIN=http://localhost:3000
MAGICBLOCK_ROUTER=https://devnet-router.magicblock.app/
API_KEY=replace-with-a-long-random-secret
RUN_MIGRATIONS_ON_START=true
```

`CORS_ORIGIN` accepts a comma-separated allowlist. Sync signatures and Anchor
event payloads are always verified. Never put `API_KEY` in a `NEXT_PUBLIC_*`
variable or browser bundle.

## Production container

```bash
docker build -t magic-chess-backend .
docker run --env-file .env -p 3001:3001 magic-chess-backend
```

The image runs compiled JavaScript (`node dist/app.js`). Point the platform
health check at `GET /api/health`; it returns `503` until PostgreSQL is ready.
For multiple replicas, prefer a separate release command:

```bash
npm run build
npm run migrate:prod
```

Then set `RUN_MIGRATIONS_ON_START=false` on application replicas. Startup
migrations are advisory-locked and transactional, but a release job keeps
schema changes out of the request-serving lifecycle.

## Frontend and on-chain contract

- Create runs on the base RPC and leaves the match undelegated so another
  player can join.
- Join also runs on the base RPC, then either player delegates the active
  match to the MagicBlock ER.
- Moves and commits use the ER endpoint returned by router
  `getDelegationStatus`; settlement runs after commit/undelegation as required.
- The frontend submits transactions to L1/ER and reads the game account for
  transaction construction. The realtime backend distributes only verified,
  indexed state; it never accepts moves or decides game outcomes.
- Backend history, lobbies, realtime notifications, leaderboards, and profiles
  become complete only when the trusted indexer delivers all six event types in
  transaction order.

## What was skipped

- **Indexer/webhook worker** — Required outside this service. It must deliver
  confirmed L1 and ER events in order and retry failures; Helius can cover L1,
  while ER logs need a MagicBlock-aware subscriber.
- **Redis fan-out** — The SSE hub is process-local and PostgreSQL polling repairs
  state across replicas. Use sticky sessions or add Redis/NATS before running
  several replicas that must share sub-second presence and replay buffers.
- **Crank worker** — Manual timeout claiming works. Add when automated timeout enforcement needed.
- **ELO table** — Schema ready but not populated. Add when rating system launches.
- **PGN export** — Move history endpoint has all data needed. Add PGN formatting endpoint on demand.
