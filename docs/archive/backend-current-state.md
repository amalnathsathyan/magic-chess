# Arena — Current State

> Updated 2026-08-09. Full stack: Solana program → SDK → frontend (Cloudflare Workers) → backend (Render).

## Live Endpoints

```
Frontend:  https://arena.chessmagic.workers.dev   (Cloudflare Workers, static export)
Backend:   https://magic-chess-d84o.onrender.com   (Render free tier, Fastify 5)
Health:    GET /api/health → {"status":"ok","db":"connected","cachedBoards":0}
```

## Architecture

```
Browser (Privy auth)
  ├── signAndSendTransaction({ sponsor: true })  ← L1 txs sponsored for embedded wallets
  ├── MagicBlock delegation                      ← ER moves gasless after delegation
  └── Solana program (22 instructions, FbXiX6...)
        │
        ├── Frontend (Next.js 15, static export, Cloudflare Workers)
        │     └── Client-side SPA, reads matchId from URL
        │
        └── Backend (Fastify 5, Render free tier)
              └── Supabase PostgreSQL (session pooler, IPv4)
                    ├── matches, moves, player_stats
                    └── Realtime SSE via /api/realtime/*
```

## Frontend

**Build:** Next.js 15 → `output: "export"` → static HTML/CSS/JS → Cloudflare Workers with `_worker.js` for SPA routing.

**Deploy:** Cloudflare Workers Builds watches `main` branch. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Root: `frontend/`.

**Why static export:** OpenNext SSR handler was 13 MiB — exceeded Workers free tier (3 MiB) and paid tier (10 MiB). Static export has no server bundle. Dynamic routes (`/play/[matchId]`) generate a placeholder at build time; client reads matchId from URL path.

### Env vars (Cloudflare Build Variables)

All must be in both Build Variables AND wrangler.toml vars:
```
NEXT_PUBLIC_RPC_ENDPOINT = https://rpc.magicblock.app/devnet
NEXT_PUBLIC_MAGICBLOCK_ROUTER = https://devnet-router.magicblock.app/
NEXT_PUBLIC_PROGRAM_ID = FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
NEXT_PUBLIC_WAGER_MINT = So11111111111111111111111111111111111111112
NEXT_PUBLIC_WAGER_SYMBOL = WSOL
NEXT_PUBLIC_WAGER_DECIMALS = 9
NEXT_PUBLIC_PLATFORM_FEE_BPS = 100
NEXT_PUBLIC_PLATFORM_FEE_WALLET = 5qLADWwuHGpEDaj5CNZhLaotrXxSXg8pXddU9qjQA5BJ
NEXT_PUBLIC_API_URL = https://magic-chess-d84o.onrender.com
NEXT_PUBLIC_PRIVY_APP_ID = cmsdk4zc7003y0cjlc22j9igy
```

### Auth flow

1. **PrivyProvider** (`Providers.tsx`) — `toSolanaWalletConnectors({ shouldAutoConnect: true })`, login methods: email, Google, wallet, Discord. Solana-only chain.
2. **AuthGate** — wraps play page. Three states: unauthenticated → "Sign in" CTA, authenticated but no wallet → "Create wallet", ready → render children.
3. **WalletButton** — header widget. Sign in / create wallet / disconnect states with address display.
4. **Player detection** — compares `wallet.address` to `match.players[0]` and `match.players[1]` from on-chain. Match → player (white/black). No match → spectator.

### Gas sponsorship

**Privy native sponsorship** — toggle ON in Privy Dashboard → Gas Sponsorship → Solana devnet.

**Implementation** (`SolanaProgramProvider.tsx`): Override `AnchorProvider.sendAndConfirm()` to route all transactions through Privy's `signAndSendTransaction({ sponsor: true })`. Embedded wallets get sponsored; external wallets ignore the flag.

**Per-game cost:** 5 L1 transactions (create, join, delegate, settle × 2). MagicBlock ER moves are gasless after delegation. Fund Privy sponsorship wallet with devnet SOL.

### Status-dependent UI (play page)

| Match state | User role | Action shown |
|---|---|---|
| WaitingForOpponent | Not creator | Join Match button |
| WaitingForOpponent | Creator | "Waiting for opponent" message |
| Active | Player, not delegated | Delegate button |
| Active | Player, delegated, your turn | Board + move controls |
| Active | Spectator | Spectate link |
| Terminal | Anyone | Result display |

### Realtime

`useMatchRealtime` hook — SSE (EventSource) to backend `/api/realtime/matches/:id/session`. Receives: `match.snapshot`, `match.notification`, `clock.tick`, `presence.sync`, `resync.required`. Fallback: 3s polling via `refetch()`.

## Backend

**Deploy:** Render free tier, Dockerfile auto-detected. Supabase session pooler (port 6543, IPv4) — direct connection (port 5432, IPv6) unreachable from Render.

**Stack:** Fastify 5 + `postgres` npm (raw SQL, not Supabase client) + in-memory board cache.

### Env vars (Render dashboard)

```
DATABASE_URL = postgresql://postgres.kdsujmdubweeofjyztos:***@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
API_KEY = <generated via openssl rand -hex 32>
CORS_ORIGIN = https://arena.chessmagic.workers.dev,http://localhost:3000
NODE_ENV = production
PORT = 3001
RPC_ENDPOINT = https://api.devnet.solana.com
PROGRAM_ID = FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
```

### Source tree

```
backend/src/
├── app.ts                  # Fastify entry: CORS → migrations → routes → listen
├── config.ts               # Env validation, defaults for all vars
├── db/
│   ├── pool.ts             # postgres npm, 10 connections
│   └── migrate.ts          # Idempotent migrations
├── routes/
│   ├── health.ts           # GET /api/health
│   ├── matches.ts          # GET /api/matches, /:id, /:id/history
│   ├── players.ts          # GET /api/players/:pubkey/stats, /matches
│   ├── leaderboard.ts      # GET /api/leaderboard
│   ├── sync.ts             # POST /api/sync/* (X-API-Key auth)
│   └── realtime.ts         # GET/POST /api/realtime/* (SSE sessions)
└── services/
    ├── boardCache.ts       # In-memory FEN engine
    ├── transactionVerifier.ts  # On-chain tx verification
    ├── walletProof.ts      # Wallet signature verification
    ├── matchRealtime.ts    # SSE hub for live match events
    └── matchSnapshot.ts    # Snapshot loading for realtime sessions
```

### API

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /api/health` | None | DB status + cache info |
| `GET /api/matches` | None | Paginated match list with FEN |
| `GET /api/matches/:id` | None | Full match detail |
| `GET /api/matches/:id/history` | None | Move-by-move with FEN |
| `GET /api/leaderboard` | None | Ranked by wins/rate/games |
| `GET /api/players/:pubkey/stats` | None | W/L/D, streaks, amounts |
| `GET /api/realtime/*` | None | SSE session provisioning |
| `POST /api/sync/*` | X-API-Key | Event ingestion (idempotent) |

### Database (Supabase PostgreSQL)

| Table | Purpose |
|---|---|
| `matches` | Every match from on-chain |
| `moves` | Every move with FEN after move |
| `player_stats` | Aggregated W/L/D, streaks |
| `sync_events` | Idempotency guard (signature + type + match_id + event_index UNIQUE) |

## SDK (`@magic-chess/sdk`)

TypeScript client + React hooks. Linked via `file:../sdk` in frontend. `transpilePackages: ["@magic-chess/sdk"]` in next.config.

Key exports:
- `MagicChessClient` — full Anchor program wrapper (createMatch, joinMatch, makeMove, delegateMatch, etc.)
- `useMatch`, `useMatches`, `usePlayerMatches` — React hooks reading on-chain
- `boardToFen`, `fenToBoard` — FEN utilities
- `MagicChessProvider` — context provider for program + wallet + router endpoint

## Deployment history (lessons)

1. **Fly.io** — no free tier for new accounts, requires credit card. Skipped.
2. **Render** — free tier works. Node 24 needs explicit `types: ["node"]` in tsconfig. Supabase direct connection uses IPv6 — Render can't reach. Session pooler (port 6543, IPv4) fixed it.
3. **OpenNext SSR** — 13 MiB handler exceeds Workers limits. Static export fixed it.
4. **Cloudflare Workers vs Pages** — Workers Builds token needs Workers Scripts:Edit. Pages deploy needs Pages:Edit. Stick to Workers with static assets + `_worker.js` for SPA routing.
5. **Wrangler auto-detection** — Stale `.open-next/` dir and `open-next.config.ts` caused wrangler to invoke OpenNext deploy. Delete both on migration to static export.
6. **`_worker.js` as asset** — Cannot be in `public/` (copied to `out/` → treated as asset). Must live in `frontend/` root, referenced by `main = "_worker.js"` in wrangler.toml.

## What's NOT wired yet

| Item | Priority | Notes |
|------|----------|-------|
| Frontend → backend sync calls | High | SDK transactions don't call `/api/sync/*` after confirm. Backend stays empty until sync wired. |
| Privy gas sponsorship toggle | High | Must be enabled in Privy Dashboard for gasless UX |
| Prediction market UI | Medium | Program has prediction instructions. Frontend needs UI. |
| ELO ratings | Low | Schema ready, not populated |
| Paymaster wallet funding | High | Privy sponsorship wallet needs devnet SOL |
| Supabase Realtime (frontend direct) | Low | SSE via backend already works; DB-level subscriptions optional |
| Helius webhooks | Low | Client-driven sync sufficient for MVP |
| PGN export | Low | Move history has all data |

## Related docs

- `docs/docs/architecture.md` — System architecture
- `docs/docs/spec.md` — Full project spec
- `docs/docs/deployment.md` — Deployment guide
- `backend/README.md` — Backend quickstart
