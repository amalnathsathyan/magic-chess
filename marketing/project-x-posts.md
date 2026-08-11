# Project X Posts — @arena_sol

> Official Arena project account. On-chain chess on Solana, powered by MagicBlock.
> Newest posts at top. Status: [DRAFT] = ready, [POSTED] = published, [SCHEDULED] = queued.

---

### Aug 11 — Late Night [DRAFT]
**Arena shipped 15 improvements today — wallet dropdown, profile overhaul, token picker, PGN export, and a fully gasless chess experience on devnet.**

What's new in today's deploy:

- **Token picker** — create matches with WSOL, custom SPL tokens, or free. Pick from the dropdown or paste a mint address.
- **Single-transaction match creation** — ATA and match initialization bundled into one tx. One wallet approval, not two.
- **Backend gas sponsorship** — embedded wallets pay zero SOL. The backend fee payer covers all rent, ATA creation, and network fees. External wallets pay their own gas.
- **Dynamic match routes** — `/play/[matchId]` now loads correctly on Cloudflare Workers static export. SPA fallback with client-side routing.
- **Wallet dropdown** — full address with copy-to-clipboard, one-click disconnect.
- **Profile overhaul** — wallet display, win/loss/draw badges, winnings summary, clickable match history.
- **PGN export** — download game notation as `.pgn` files. Copy PGN/FEN to clipboard.
- **Low-time pulse** — timer pulses red under 10 seconds. Seconds-only display under 1 minute.
- **Sound effects** — move, capture, castle, check sounds with browser autoplay unlock.
- **Professional error pages** — branded 404 and 500 with navigation back to arena.
- **Backend security** — constant-time API key comparison, per-IP rate limiting on all sync endpoints.

15 commits, ~1,300 lines changed. Full changelog on GitHub.

Live: arena-dev.chessmagic.workers.dev
Backend: magic-chess-dev.onrender.com
Program: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet)
Repo: github.com/amalnathsathyan/magic-chess

Try it. Break it. Every move is on-chain. You just won't notice.

`#solana` `#chess` `#magicblock` `#buildinpublic` `#gaming`

---

### Aug 11 — Night [DRAFT]
**Full game lifecycle verified on devnet: create, join, delegate, session key, and gasless moves via MagicBlock Ephemeral Rollups. All confirmed on-chain.**

Two test matches completed end-to-end. The session key flow eliminates per-move wallet popups — one approval at the start, then every move is a locally-signed ER transaction with zero fees.

Test signatures from the latest smoke test:
```
Match:  G2cy26c6D4Ae3rA2kt3tPAppBS9orLyEZvi9reE3DVhv
Create: 4PBZTHGGSg8UZqiwLGd8ekwiyVCb8v8WGjUuXFyZrSU...
Join:   5MG5ssgzRnRHtz5iRyMuRpraz7gXwoih26BTcgHrFUW...
Session: 4fqyjS3RAagsQbNL34PGjpA855biWqN6ZsYSgFV5Toh...
Move:   5H4qfwbhba5ceqjrYhwN45cAoAWBNVTNAMBZgASzHoW...
ER:     devnet-as.magicblock.app
```

The architecture: L1 holds tokens and escrow. MagicBlock ER handles gameplay. Session keys sign moves locally. Zero gas per move. State commits back to L1 on settlement.

Try it on devnet or run the smoke test yourself: `npx tsx magic-chess-program/scripts/verify-session-v2-devnet.ts`

`#solana` `#magicblock` `#chess` `#gaming` `#opensource`

---

### Aug 11 — Night [DRAFT]
**Custom Solana gas sponsorship relay is live. Every L1 transaction is now validated, co-signed, simulated, and broadcast by a secure backend fee payer.**

The architecture: frontend builds and user-signs the transaction → `POST /api/transactions/sponsor` with Privy access token → backend verifies JWT, validates transaction structure, adds fee-payer signature, simulates, broadcasts, confirms.

Validation policy per transaction:
- Authenticated user wallet must match JWT
- Program must be `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
- `initialize_match` discriminator verified byte-for-byte
- Exact Anchor account ordering enforced
- Wager mint, instruction count, serialized size all checked
- No System transfer sourced from sponsor
- Rate-limited per user

This replaces Privy's binary sponsorship toggle with a programmable relay. The backend holds the fee-payer key in its secret store — never exposed to the browser.

What sponsorship covers: network fees, ATA rent, match PDA rent, escrow rent (via separate `rent_payer` signer). What it doesn't cover: wager principal. Players bring their own SOL.

Docs: `docs/docs/03-core-systems/gas-sponsorship.md`
Commits: `260fe8a`, `f844fcf`, `ecbfe0b`, `b45a58c`

`#solana` `#gasless` `#chess` `#buildinpublic`

---

### Aug 11 — Afternoon [DRAFT]
**MagicBlock session gameplay verified on devnet. Create, delegate, play — one approval, zero fees per move.**

End-to-end smoke test passed on devnet:

```
match mc-019fed6dcd40def7c220
session ZArmZ6pAnisaT1ujzyXtywZT7YvQzNu4yDqJ1qywvc3HkuNq5bYF3czuaR124QqTmrtbwVowKthKNeu2EgjmxfN
delegation 3WE5MwUhVnksRDYMKFfEKC7vcBzJE9sUnUHRNMWv9bHYmRLedfawyhxWij8tEboTab4B2HhLPQ9S8AUKKBuLCsv
ER move ate628i9QWc3HwkgtznTiQEUaaGvGAq4kbJKoNvFABJTHKyuLqEz77NRqHh9Dj5yA42gPeReNyPEB47z3m1SAdr
ER https://devnet-as.magicblock.app/
```

The flow: user creates a 55-minute memory-only session key (never persisted, never logged) → backend tops up 0.002 SOL → session delegated to MagicBlock → all moves signed by session key, submitted directly to the router-selected ER endpoint → no Privy popup, no wallet approval per move.

Session creation validation in the backend is strict: program `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`, canonical PDA, six exact accounts, player + session signatures, exact 0.002 SOL top-up, expiry capped at one hour, no mixed operations.

Spectators can subscribe to ER match logs, decode `MoveMadeEvent`, and watch the board update live with MagicBlock explorer toasts.

25/25 backend tests passing. SDK + frontend typechecks clean. Program upgraded on devnet.

`#solana` `#magicblock` `#chess` `#gaming`

---

### Aug 9 — Night [DRAFT]
**Arena is now fully gasless for social login users. External wallet users pay their own gas. Both paths work seamlessly.**

What shipped today:
- **Privy native gas sponsorship** — embedded wallet users (email, Google, Discord) pay zero SOL for all transactions. External wallet users (Phantom, Solflare, Backpack) pay their own gas. One code path, automatic.
- **Static export architecture** — migrated from OpenNext SSR to Next.js static export. No server bundle, no Worker size limits, instant edge delivery. 10 static pages, dynamic routes handled client-side.
- **Backend live on Render** — Fastify 5 + Supabase PostgreSQL indexing all on-chain events. Match history with FEN, leaderboard, player stats, real-time SSE updates.
- **MagicBlock gasless moves** — after initial delegation, every chess move is an on-chain transaction with zero fees. The ER runtime absorbs gas.

How gas sponsorship works: Privy manages a fee payer wallet. When `sponsor: true` is passed to `signAndSendTransaction`, Privy replaces the fee payer with its own wallet. The user signs the transaction normally. Privy pays the fee. The user sees no difference — just a faster confirm.

Live: https://arena.chessmagic.workers.dev
Backend: https://magic-chess-d84o.onrender.com
Repo: github.com/amalnathsathyan/magic-chess
Program: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet)

No gas. No seed phrases. Just chess.

`#solana` `#chess` `#magicblock` `#gasless`

---

### Aug 9 — Afternoon [DRAFT]
**Backend indexing infrastructure is live. Every on-chain chess event is now queryable via REST API.**

The stack: Fastify 5 → Supabase PostgreSQL (session pooler) → Render free tier.

Endpoints:
```
GET /api/matches          — paginated match list with live FEN
GET /api/matches/:id       — full match detail + board state
GET /api/matches/:id/history — move-by-move history
GET /api/leaderboard       — ranked by wins/rate/games
GET /api/players/:pubkey/stats — W/L/D, streaks, wagered/won
GET /api/health            — status + DB connectivity
```

The FEN engine replays on-chain MoveMade events exactly as the Rust program does — castling rights, en passant, halfmove clock, fullmove number. Every move generates correct FEN: `e2e4` → `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1`.

Architecture note: backend connects to Supabase via raw Postgres (session pooler, IPv4), not the Supabase REST API. One less dependency. Migrations run on startup. Client-driven sync (frontend reports on-chain events after tx confirm) — no webhook infrastructure needed for MVP.

Repo: github.com/amalnathsathyan/magic-chess
Backend docs: docs/docs/planning/backend-current-state.md

`#solana` `#backend` `#supabase` `#opensource`

---

### Aug 9 — Morning [DRAFT]
**Authenticated on-chain matches are now live. Privy wallet auth + MagicBlock gasless delegation + full match lifecycle on Solana.**

The flow: sign in with email or social → delegated session created → create/join matches → every move is an on-chain transaction with zero user-visible fees.

Technical highlights:
- **Privy** for wallet auth — no seed phrases, email + social login
- **MagicBlock delegation** for gasless UX — one signature per session, not per move
- **Platform fee PDA** configured — 100 bps routed to program-owned escrow, not a hot wallet
- **59 files changed**, 9,400+ lines in the frontend auth refactor

The chess engine (22 instructions, 182 on-chain tests) now has a real frontend with real users playing real games. This isn't a demo anymore.

Live: https://arena.chessmagic.workers.dev
Repo: github.com/amalnathsathyan/magic-chess
Program: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet)

Create a match. Play a game. Every move is on-chain. You just won't notice.

`#solana` `#chess` `#magicblock` `#gaming`

---

### Aug 8 — Night [DRAFT]
**Arena is now live on Cloudflare Workers via OpenNext. Full Next.js SSR, not static.**

What changed:
- **Migrated to OpenNext** — proper Next.js → Cloudflare Workers bridge. Full SSR, ISR, middleware support. No more static-asset workarounds.
- **Rebranded to Arena** — shorter, cleaner, gamer-focused. One word. One syllable. The arena hosts games, spectators predict outcomes, AI agents compete.
- **Live demo** in README — one-click to the deployed app

Live: https://arena.chessmagic.workers.dev
Repo: github.com/amalnathsathyan/magic-chess
Program: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet)

The stack: Solana (Anchor/Rust) → TypeScript SDK → Next.js 15 + OpenNext → Cloudflare Workers → Fastify 5 backend → Supabase PostgreSQL.

`#solana` `#nextjs` `#cloudflare` `#opensource`

---

### Aug 8 — Evening [DRAFT]
**Magic Chess frontend is live on Cloudflare Workers. 8 pages, 182 on-chain tests, full stack operational.**

Live: https://arena.chessmagic.workers.dev

What shipped today:
- **Frontend**: lobby → create/join → play → resign → leaderboard → profile. All wired to on-chain program + backend API
- **Backend**: Fastify 5 + Supabase PostgreSQL. Match indexing, move history with FEN, player stats, leaderboard. API key auth on all write endpoints
- **Security**: SQL injection fixed, sync endpoint auth added, resign wired to chain (was local-only)
- **Infrastructure**: Cloudflare Workers Builds deploy pipeline green. Next.js 15 statically exported as Worker assets

Stack: Solana (Anchor/Rust) → TypeScript SDK → Next.js 15 → Fastify 5 → Supabase PostgreSQL

Program: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet)
Repo: github.com/amalnathsathyan/magic-chess

Try it. Break it. Build on it.

`#solana` `#chess` `#magicblock` `#buildinpublic`

<!-- Checked 2026-08-10 06:00 UTC: no new developments -->

---

### Aug 8 — Afternoon [DRAFT]
**Backend infrastructure is live. Match indexing, leaderboard, and player profiles — all running on Supabase.**

The stack:
- **Fastify 5** API server — match history, move history with FEN, leaderboard, player stats
- **Supabase PostgreSQL** — 3 tables (matches, moves, player_stats), Realtime enabled
- **FEN engine** — server-side board cache replays moves exactly as the on-chain engine does, generates correct FEN after every move
- **Client-driven sync** — frontend reports on-chain events via POST /api/sync/*, backend verifies before writing

API endpoints live at localhost:3001:
```
GET  /api/matches              — paginated match list with FEN
GET  /api/matches/:id           — full match detail + live board state
GET  /api/matches/:id/history   — move-by-move history with FEN after each move
GET  /api/leaderboard           — ranked by wins/winRate/totalGames
GET  /api/players/:pubkey/stats — W/L/D, streaks, wagered/won
POST /api/sync/*                — event ingestion (idempotent)
```

Why this matters: querying match history from chain requires deserializing accounts + multiple RPC calls. Indexed DB gives instant responses. Leaderboard aggregation on-chain would be prohibitively expensive. Player profiles need cross-match queries that don't exist on-chain.

Architected minimal: skipped Redis (Supabase Realtime for pub/sub), skipped Helius webhooks (client-driven sync for MVP), skipped ELO (schema ready when rating system launches).

Repo: github.com/amalnathsathyan/magic-chess
Backend docs: docs/docs/planning/backend-current-state.md

`#solana` `#backend` `#supabase` `#opensource`

<!-- Checked 2026-08-10 ~12:00 UTC: no new developments -->
