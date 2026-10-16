---
sidebar_position: 5
title: Backend
---

# Backend

`backend/` is a Fastify 5 + TypeScript service backed by PostgreSQL (Supabase
in production). It never decides game outcomes. It does four jobs:

1. **Gas sponsor.** Co-signs and pays for allowlisted base-layer transactions
   from Privy embedded wallets. See [Gas sponsorship](../features/gas-sponsorship.md).
2. **Chain indexer.** Reads program events from Solana and from each live
   match's rollup, and stores matches, moves, results and payouts.
3. **Realtime hub.** Streams indexed match state, presence and a shared clock
   to players and spectators over Server-Sent Events.
4. **Social layer.** Elo ratings, profiles, leaderboards and play-point move
   predictions.

```
src/
├── app.ts                 # server, CORS, route registration, indexer start
├── config.ts              # env parsing
├── db/                    # postgres pool + idempotent migrations
├── routes/                # HTTP API (below)
└── services/
    ├── solanaSponsor.ts       # validate → co-sign → simulate → send
    ├── sponsorBudget.ts       # per-user and global budgets
    ├── privyAuth.ts           # Privy access-token verification (JWKS)
    ├── chainIndexer.ts        # base-layer program scan + per-match rollup scan
    ├── eventIngest.ts         # decode + idempotent ingest of program events
    ├── transactionVerifier.ts # fetch confirmed tx, scope logs, decode events
    ├── matchRealtime.ts       # SSE hub: sessions, presence, replay buffer, clock
    ├── movePredictions.ts     # play-point move markets
    ├── rating.ts              # Elo
    └── profiles.ts            # profile edits with wallet-signed challenges
```

## Indexing

The indexer polls two sources and feeds both into one idempotent `ingest` path:

- **Program scan** (every `CHAIN_INDEXER_PROGRAM_INTERVAL_MS`, default 15 s):
  base-layer signatures for the program. Picks up creates, joins, aborts,
  settlements and undelegated moves.
- **Match scan** (every `CHAIN_INDEXER_MATCH_INTERVAL_MS`, default 3 s): each
  live match's PDA on its current runtime (the rollup while delegated), so
  moves land in the index within seconds.

Browsers may also post a transaction signature to `/api/sync/*` as a hint. The
backend fetches the confirmed transaction itself and decodes events from the
program's own logs. Request bodies cannot supply players, wagers, moves or
results. Duplicate deliveries are ignored through the `sync_events` table.

## Database

Migrations live in `src/db/migrate.ts` and run on boot unless
`RUN_MIGRATIONS_ON_START=false`.

| Table | Contents |
| --- | --- |
| `matches` | One row per match: players, status, end reason, wager, timeout, timestamps, payout |
| `moves` | Every move with SAN, coordinates and FEN after the move |
| `player_stats` | Wins/losses/draws, streaks, amounts, Elo rating |
| `player_profiles` | Display name and avatar, editable with a signed challenge |
| `sync_events` | Ingested event keys for idempotency |
| `prediction_accounts`, `move_markets`, `move_bets` | Play-point move predictions |
| `_migrations` | Applied migration ids |

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/health` | DB, indexer, sponsor and realtime status. `503` until the DB is ready |
| GET | `/api/lobbies` | Open matches waiting for an opponent |
| GET | `/api/matches` | Matches, filter by `status`, `player` and `timedOut` (side to move out of time, unclaimed) |
| GET | `/api/matches/:matchId` | One match with current FEN and timeout state |
| GET | `/api/matches/:matchId/history` | Moves with FEN after each move (replay) |
| GET | `/api/players/:pubkey/stats` | Record, streaks, rating |
| GET | `/api/players/:pubkey/matches` | Paginated match history |
| GET | `/api/players/:pubkey/profile` | Profile, rating history, openings |
| GET | `/api/players/:pubkey/profile/challenge` | Message to sign for a profile edit |
| POST | `/api/players/:pubkey/profile` | Update profile (signed) |
| GET | `/api/leaderboard` | `sortBy=rating|wins|winRate|totalGames` |
| GET | `/api/realtime/matches/:matchId/challenge` | Message a player signs to join the stream as a player |
| POST | `/api/realtime/matches/:matchId/session` | Create a player or spectator session |
| GET | `/api/realtime/matches/:matchId/events` | SSE stream |
| GET | `/api/predictions/challenge` · POST `/api/predictions/session` | Sign in to predictions |
| GET | `/api/predictions/me` · `/api/predictions/leaderboard` | Balance, open bets, top predictors |
| GET | `/api/matches/:matchId/predictions` | Open move markets |
| POST | `/api/matches/:matchId/predictions/:ply` | Stake points on a move |
| POST | `/api/transactions/sponsor` | Co-sign and send a sponsored transaction (Privy token required) |
| POST | `/api/sync/{match-created,player-joined,move-made,game-ended,match-aborted,payout}` | Ingest hint `{ matchId, signature, runtimeEndpoint?, eventIndex? }` |

### Realtime events

Open the `eventUrl` returned by the session endpoint with `EventSource`.
Reconnects send `Last-Event-ID` and the server replays its buffer, or sends
`resync.required` followed by a full snapshot.

| Event | Payload |
| --- | --- |
| `session.ready` | Assigned role (`white`, `black`, `spectator`) |
| `presence.sync` | Who is online, spectator count |
| `match.notification` | Create, join, move, end, abort, payout |
| `match.snapshot` | Full indexed match state |
| `clock.tick` | Side to move and remaining time for the current move |

The clock is for display. Timeouts are enforced by the program.

## Configuration

Copy `backend/.env.example`. The important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres. On Supabase use the **session pooler** string; the direct host is IPv6-only |
| `RPC_ENDPOINT` | Base-layer RPC. Use a dedicated devnet RPC; the public one rate-limits the indexer |
| `PROGRAM_ID`, `MAGICBLOCK_ROUTER`, `WAGER_MINT`, `PLATFORM_FEE_WALLET` | Chain settings |
| `SOLANA_FEE_PAYER_PRIVATE_KEY`, `SOLANA_FEE_PAYER_ADDRESS` | Sponsor keypair (base58). Secret, server only |
| `PRIVY_APP_ID` (+ optional `PRIVY_JWKS_URL` / `PRIVY_JWT_VERIFICATION_KEY`) | Verifies Privy access tokens |
| `SPONSOR_REQUESTS_PER_MINUTE`, `SPONSOR_COSTLY_PER_HOUR`, `SPONSOR_HOURLY_BUDGET_LAMPORTS`, `SPONSOR_MAX_WAGER_LAMPORTS` | Sponsor limits |
| `CHAIN_INDEXER_ENABLED`, `CHAIN_INDEXER_*_INTERVAL_MS` | Indexer switches |
| `PREDICTION_SESSION_SECRET` | HMAC secret for prediction sessions |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `API_KEY` | Optional key trusted indexers send as `X-API-Key` on `/api/sync/*` |
| `RUN_MIGRATIONS_ON_START` | `false` when migrations run as a release step |

## Known limits

- The SSE hub is in-process. Several replicas need sticky sessions, or a shared
  bus such as Redis, for sub-second presence. Postgres polling (every 3 s)
  keeps replicas consistent.
- Settlement is not automated from the backend yet. See [Roadmap](../roadmap.md).
