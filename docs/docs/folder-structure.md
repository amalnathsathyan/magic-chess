# Magic Chess -- Folder Structure Plan

> **Principle:** "Easy to find, easy to understand, no surprises."
> A file should live where someone expects to find it on their first guess.

---

## Table of Contents

1. [Program (Rust/Anchor)](#1-program-rustanchor)
2. [TypeScript SDK](#2-typescript-sdk)
3. [Next.js Frontend](#3-nextjs-frontend)
4. [Backend (Future)](#4-backend-future)
5. [Tests](#5-tests)
6. [Cross-cutting Rules](#6-cross-cutting-rules)
7. [Visual Tree](#7-visual-tree)

---

## 1. Program (Rust/Anchor)

### Current Structure

```
magic-chess-program/programs/magic_chess/src/
├── lib.rs                          # 164 lines — instruction dispatch
├── constants.rs                    # 32 lines — seeds, limits, defaults
├── errors/mod.rs                   # 124 lines — 40 error variants
├── events/mod.rs                   # 78 lines — 7 event structs
├── instructions/
│   ├── mod.rs                      # 41 lines — 20 modules + re-exports
│   ├── initialize_match.rs         # 148 lines
│   ├── join_match.rs               # 91 lines
│   ├── make_move.rs                # 218 lines
│   ├── resign_game.rs              # 78 lines
│   ├── claim_timeout_win.rs        # 138 lines
│   ├── process_match_settlement.rs # 166 lines
│   ├── abort_match.rs              # 129 lines
│   ├── close_match.rs              # 40 lines
│   ├── delegate_match.rs           # 31 lines
│   ├── commit_state.rs             # 25 lines
│   ├── undelegate_match.rs         # 28 lines
│   ├── schedule_timeout.rs         # 121 lines
│   ├── cancel_timeout_task.rs      # 45 lines
│   ├── set_session_key.rs          # 46 lines
│   ├── revoke_session_key.rs       # 33 lines
│   ├── initialize_prediction_pool.rs # 79 lines
│   ├── place_prediction_bet.rs     # 140 lines
│   ├── settle_prediction_pool.rs   # 57 lines
│   ├── claim_prediction_winnings.rs # 158 lines
│   └── cancel_prediction_bet.rs    # 127 lines
├── state/
│   ├── mod.rs                      # 13 lines — 6 modules + re-exports
│   ├── chess_match.rs              # 52 lines — ChessMatch account struct
│   ├── piece.rs                    # 9 lines — Piece struct
│   ├── enums.rs                    # 59 lines — GameStatus, PlayerColor, etc.
│   ├── castling_rights.rs          # 27 lines
│   ├── en_passant_square.rs        # 8 lines
│   └── prediction_pool.rs          # 32 lines
└── utils/
    ├── mod.rs                      # 4 lines
    ├── chess_logic.rs              # 774 lines — full FIDE engine
    └── payout_logic.rs             # 210 lines — escrow math
```

### Evaluation

| Aspect | Verdict | Notes |
|--------|---------|-------|
| **Instructions/** | **Good as-is. No split needed.** | 20 files, 25-218 lines each. One file per instruction is idiomatic Anchor. Flat listing is findable because each file name matches the instruction name exactly. |
| **State/** | **Well-organized.** | One concept per file. ChessMatch is the largest at 52 lines. No splitting needed. |
| **Errors/** | **Single file, correct.** | Anchor `#[error_code]` enum. 40 variants. Single file is standard. |
| **Events/** | **Single file, correct.** | 7 event structs. All related. No reason to split. |
| **Utils/** | **Good.** | chess_logic.rs at 774 lines is the largest file in the program — but it's a self-contained chess engine. No clean split line exists. If it grows past ~1500 lines, split by domain: `chess_logic/moves.rs`, `chess_logic/validation.rs`, `chess_logic/endgame.rs`. |
| **constants.rs** | **Correct placement at root.** | Single source of truth for all magic numbers. |

### Recommendation: Add Section Grouping Comments

The flat `instructions/` directory is correct, but add clear grouping in `mod.rs` so readers immediately understand the three domains:

```rust
// ── Game Lifecycle (Core) ──
pub mod initialize_match;
pub mod join_match;
pub mod make_move;
pub mod resign_game;
pub mod claim_timeout_win;
pub mod process_match_settlement;
pub mod abort_match;
pub mod close_match;

// ── MagicBlock Ephemeral Rollups ──
pub mod delegate_match;
pub mod commit_state;
pub mod undelegate_match;
pub mod schedule_timeout;
pub mod cancel_timeout_task;
pub mod set_session_key;
pub mod revoke_session_key;

// ── Prediction Market ──
pub mod initialize_prediction_pool;
pub mod place_prediction_bet;
pub mod settle_prediction_pool;
pub mod claim_prediction_winnings;
pub mod cancel_prediction_bet;
```

### When to Split (Future Thresholds)

| Trigger | Action |
|---------|--------|
| Instructions exceed 30 files | Create subdirectories: `instructions/core/`, `instructions/magicblock/`, `instructions/prediction/` with per-directory mod.rs |
| chess_logic.rs exceeds 1500 lines | Split into `chess_logic/moves.rs`, `chess_logic/validation.rs`, `chess_logic/endgame.rs` |
| A single instruction file exceeds 300 lines | Extract helper functions into the same file's module directory (e.g., `instructions/make_move/`) |
| State structs proliferate beyond 10 files | Group related state under `state/match/`, `state/prediction/` |

### Proposed Structure (Identical to Current)

No reorganization needed. The current structure is correct. Only the mod.rs grouping comments change.

```
magic-chess-program/programs/magic_chess/src/
├── lib.rs
├── constants.rs
├── errors/mod.rs
├── events/mod.rs
├── instructions/           # Flat, 20 files, grouped in mod.rs by domain comment
├── state/                  # 6 concept files + mod.rs
└── utils/                  # chess_logic.rs + payout_logic.rs
```

---

## 2. TypeScript SDK

### Current Structure

```
sdk/src/
├── index.ts                # Barrel exports (55 lines)
├── client.ts               # MagicChessClient (434 lines)
├── types.ts                # TypeScript types (203 lines)
├── pda.ts                  # PDA derivation
├── magicblock.ts           # MagicBlock constants + helpers
├── idl.ts                  # IDL re-export
├── idl/magic_chess.ts      # Generated IDL type
├── react/index.ts          # Provider + 4 hooks (249 lines)
└── utils/
    ├── index.ts
    └── fen.ts              # FEN <-> board (215 lines)
```

### Evaluation

| Aspect | Verdict | Notes |
|--------|---------|-------|
| **types.ts** | **Keep as one file.** | 203 lines. All types are consumed together. Splitting into enums.ts, match.ts, events.ts would create import fragmentation for marginal benefit at this size. |
| **client.ts** | **Keep as one file for now.** | 434 lines. Getting long, but all methods share the same `this.program`/`this.wallet` context. When prediction market client methods are added (~5 more methods, ~150 lines), split by domain. |
| **react/index.ts** | **Keep as one file.** | 249 lines. Provider + 4 hooks that share the same context. Splitting into per-hook files would scatter a cohesive module. |
| **magicblock.ts** | **Extract constants.** | Currently mixes constants (RPC URLs, program IDs) with helper functions. |
| **Error handling** | **Missing file.** | Errors are thrown as plain `new Error("...")`. No typed error classes. |
| **FEN utils** | **Good.** | Self-contained, well-tested. |

### What's Missing

1. **`errors.ts`** — Typed error classes for SDK consumers to catch programmatically
2. **`pgn.ts`** (future) — PGN export from move history
3. **Prediction market client methods** — The 5 prediction instructions exist on-chain but have no client wrappers

### Recommendation: Conservative Additions

Add 2 files, restructure 1. No existing files split.

```
sdk/src/
├── index.ts
├── client.ts               # Keep as-is (434 lines), add prediction methods here
├── types.ts                # Keep as-is (203 lines)
├── errors.ts               # NEW: typed error classes
├── pda.ts
├── magicblock.ts           # MODIFIED: extract constants into dedicated exports
├── idl.ts
├── idl/magic_chess.ts
├── react/
│   └── index.ts            # Keep as-is
└── utils/
    ├── index.ts
    ├── fen.ts
    └── pgn.ts              # NEW (future): PGN export
```

### errors.ts Design

```typescript
// Typed errors so consumers can catch specific failure modes.
export class MatchNotFoundError extends Error {
  constructor(matchId: string) {
    super(`Match not found: ${matchId}`);
    this.name = "MatchNotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor(reason: string) {
    super(`Unauthorized: ${reason}`);
    this.name = "UnauthorizedError";
  }
}

export class TransactionFailedError extends Error {
  constructor(signature: string, logs: string[]) {
    super(`Transaction ${signature} failed:\n${logs.join("\n")}`);
    this.name = "TransactionFailedError";
  }
}

// ... MatchAlreadyFull, InvalidMoveError, SettlementError, etc.
```

### When to Split (Future Thresholds)

| Trigger | Action |
|---------|--------|
| client.ts exceeds 500 lines | Split into `client/`: `match.ts`, `gameplay.ts`, `settlement.ts`, `magicblock.ts`, `prediction.ts`, `queries.ts` — each exporting standalone functions or a partial class, composed in `client/index.ts` |
| types.ts exceeds 400 lines | Split into `types/`: `enums.ts`, `match.ts`, `events.ts`, `prediction.ts` |
| react/index.ts exceeds 400 lines | Split into `react/`: `provider.tsx`, `useMatch.ts`, `useMatches.ts`, `usePlayerMatches.ts`, `useMatchEvents.ts` |
| MagicBlock helpers exceed 150 lines | Extract ER-specific logic into `er-client.ts` separate from `magicblock.ts` (constants) |

---

## 3. Next.js Frontend

### Directory Separation Rules

| Directory | Contains | Does NOT contain |
|-----------|----------|------------------|
| **`app/`** | Next.js App Router pages, layouts, route handlers | Business logic, hooks, state |
| **`components/`** | React components organized by feature domain | Hooks, store atoms, pure functions |
| **`hooks/`** | Custom React hooks. One export per file. | Components, store atoms (but can read them) |
| **`store/`** | Jotai atoms. Pure state containers. No JSX. | React components, hooks |
| **`lib/`** | Pure functions. No React imports. | Components, hooks, store atoms |
| **`styles/`** | Global CSS, theme definitions, board color presets | Component logic |

### Where On-Chain Calls Live

On-chain function calls follow a strict layering:

```
Component (JSX)
  → hook/ (useMakeMove, useMatchSetup)
    → @magic-chess/sdk (MagicChessClient methods)
      → Anchor Program (RPC call)
        → Solana validator
```

- **Components** never call `client.makeMove()` directly. They call hook functions.
- **Hooks** encapsulate the SDK call + Jotai state updates + loading/error state.
- **SDK client** handles instruction building, transaction signing, and sending.
- **Store atoms** hold the reactive state that components read.

### Proposed Structure

```
frontend/
├── app/
│   ├── layout.tsx                    # Root layout: PrivyProvider + ThemeProvider + fonts
│   ├── page.tsx                      # Landing page ("/")
│   ├── providers.tsx                 # Consolidated providers (client boundary)
│   ├── arena/
│   │   ├── layout.tsx                # Arena shell: Navbar + wallet status
│   │   └── page.tsx                  # Lobby: match list, create/join
│   ├── play/
│   │   └── [matchId]/
│   │       ├── page.tsx              # Game view (board, clock, moves, controls)
│   │       └── spectate/
│   │           └── page.tsx          # Spectator view (read-only board + prediction)
│   └── profile/
│       └── page.tsx                  # Player stats, ELO, match history
│
├── components/
│   ├── landing/                      # Landing page sections
│   │   ├── Hero.tsx                  # Animated board hero + "Enter Arena" CTA
│   │   ├── HowItWorks.tsx            # 3-step cards
│   │   ├── WhyMagicBlock.tsx         # Feature comparison table
│   │   ├── GameModes.tsx             # Blitz / Standard / Friendly cards
│   │   ├── TokenFlow.tsx             # Visual escrow diagram
│   │   └── Security.tsx              # Audit score + test count badges
│   │
│   ├── chess/                        # Chess board and game UI
│   │   ├── ChessBoard.tsx            # react-chessboard wrapper, move interaction
│   │   ├── ChessClock.tsx            # Dual clock with urgency states (amber/red)
│   │   ├── MoveList.tsx              # SAN notation, scrollable, clickable
│   │   ├── CapturedPieces.tsx        # Side display of captured pieces
│   │   ├── PromotionDialog.tsx       # Piece selection modal on promotion
│   │   ├── GameStatusOverlay.tsx     # Checkmate/stalemate/draw overlay with result
│   │   └── BoardControls.tsx         # Flip board, resign, offer draw
│   │
│   ├── lobby/                        # Match lobby
│   │   ├── MatchCard.tsx             # Single match in list
│   │   ├── CreateMatchForm.tsx       # Token, wager, timeout, mode selector
│   │   ├── JoinMatchDialog.tsx       # Confirm join + token approval
│   │   └── LiveGamesFeed.tsx         # Active games with real-time updates
│   │
│   ├── prediction/                   # Prediction market UI
│   │   ├── PredictionPool.tsx        # Pool stats: total, odds per outcome
│   │   ├── PlaceBetForm.tsx          # Bet on White/Black/Draw
│   │   └── ClaimWinningsButton.tsx   # Claim settled winnings
│   │
│   └── shared/                       # Shared across all pages
│       ├── Navbar.tsx                # Site nav + wallet status
│       ├── Footer.tsx                # Links, social, secondary CTA
│       ├── WalletButton.tsx          # Privy connect/disconnect
│       ├── TokenDisplay.tsx          # SPL amount + token icon
│       ├── TransactionStatus.tsx     # Toast for tx pending/confirmed/failed
│       └── ErrorBoundary.tsx         # Catch and display render errors
│
├── hooks/                            # One hook per file. Each calls SDK + updates store.
│   ├── useMatchSetup.ts             # createMatch / joinMatch flow with loading states
│   ├── useMakeMove.ts               # Submits move, updates optimistic board
│   ├── useMatchPolling.ts           # Poll match state on interval or WS
│   ├── useChessClock.ts             # Clock tick, urgency detection, timeout trigger
│   ├── useSessionKey.ts             # IndexedDB key storage, expiry check
│   ├── useDelegation.ts             # Delegate/undelegate/commit flow
│   ├── useSettlement.ts             # Claim winnings after game end
│   ├── usePrediction.ts             # Place bet, view pool, claim winnings
│   └── useMatchEvents.ts            # WebSocket / polling event subscription
│
├── store/                            # Jotai atoms. Pure state, zero JSX.
│   ├── index.ts                     # Re-export all atoms
│   ├── match.ts                     # Current match: board, status, players, pot
│   ├── lobby.ts                     # Match list, filters, loading state
│   ├── wallet.ts                    # Wallet address, balance, connection status
│   ├── clock.ts                     # Clock time remaining, isRunning, urgency
│   ├── prediction.ts                # Prediction pool data for current match
│   └── ui.ts                        # UI state: side panel, theme, sound prefs
│
├── lib/                              # Pure functions. No React imports allowed.
│   ├── chess.ts                     # chess.js wrapper: validate, FEN, legal moves
│   ├── magicblock.ts                # ER connection factory, delegation helpers (thin)
│   ├── tokens.ts                    # SPL token metadata (name, symbol, decimals, icon)
│   ├── sounds.ts                    # Web Audio API: preload, play, mute toggle
│   ├── errors.ts                    # Map on-chain error codes to user-facing messages
│   ├── format.ts                    # Token amount formatting, clock display, ELO formatting
│   └── pgn.ts                       # PGN export from match history (future)
│
├── styles/
│   ├── globals.css                  # Tailwind imports + CSS custom properties (brand)
│   └── board-themes.ts              # Board color presets (default, high contrast, wood)
│
└── public/
    ├── pieces/                       # Custom chess piece SVGs (wK, wQ, ..., bP)
    ├── sounds/                       # Preloaded audio files (move, capture, check, end)
    └── icons/                        # App icons, PWA manifest icons
```

### Page Layout Conventions

```
app/page.tsx                     → Landing
app/arena/page.tsx               → Lobby
app/play/[matchId]/page.tsx      → Game
app/play/[matchId]/spectate/     → Spectator
app/profile/page.tsx             → Profile
```

### Data Flow in a Move Submission

```
1. User drops piece on ChessBoard.tsx
2. ChessBoard calls onPieceDrop callback (from useMakeMove hook)
3. useMakeMove:
   a. Validates move via lib/chess.ts (chess.js)
   b. Updates store/match.ts optimistically (piece position)
   c. Calls client.makeMove() from @magic-chess/sdk
   d. On success: updates store/match.ts with confirmed state
   e. On failure: reverts optimistic update, shows error toast
   f. Plays sound via lib/sounds.ts
   g. If checkmate/stalemate: triggers GameStatusOverlay
4. ChessBoard re-renders from store atoms with new board state
```

### Provider Nesting (app/providers.tsx)

```tsx
// Outer-most to inner-most:
<PrivyProvider>           // Auth + embedded wallet
  <JotaiProvider>         // Global state
    <MagicChessProvider>  // SDK client (from @magic-chess/sdk)
      <ThemeProvider>     // Dark/light mode
        {children}
      </ThemeProvider>
    </MagicChessProvider>
  </JotaiProvider>
</PrivyProvider>
```

---

## 4. Backend (Future)

### Purpose

The backend handles what should NOT be done client-side:
- **Indexing** — Store match history, player stats, leaderboards in Postgres (not polling RPC from the browser)
- **Webhooks** — Receive Helius events for match creation, moves, settlements
- **Crank workers** — Periodically check for timed-out players and trigger settlement on L1
- **API routes** — Serve cached/aggregated data to the frontend (match list, player profile, leaderboard)
- **Rate limiting & auth** — Protect public API endpoints

### Proposed Structure

```
backend/
├── src/
│   ├── index.ts                     # Fastify server entry, plugin registration, graceful shutdown
│   ├── config.ts                    # Environment variables, feature flags, defaults
│   │
│   ├── routes/                      # Fastify route handlers
│   │   ├── index.ts                 # Register all route plugins
│   │   ├── matches.ts              # GET /api/matches, GET /api/matches/:id
│   │   ├── players.ts              # GET /api/players/:pubkey, GET /api/players/:pubkey/matches
│   │   ├── leaderboard.ts          # GET /api/leaderboard?period=weekly
│   │   └── health.ts               # GET /api/health (liveness + readiness)
│   │
│   ├── webhooks/                    # Inbound webhook handlers
│   │   ├── helius.ts               # Helius webhook: parse event, dispatch to services
│   │   └── types.ts                # Webhook event type definitions
│   │
│   ├── workers/                     # Background / scheduled jobs
│   │   ├── crank.ts                # Periodic: check active matches for timeout, submit settlement
│   │   └── indexer.ts              # Startup + catch-up: walk historical accounts, populate DB
│   │
│   ├── services/                    # Business logic (called by routes, webhooks, workers)
│   │   ├── matchService.ts         # Match CRUD, state transitions, FEN generation
│   │   ├── playerService.ts        # Player stats, ELO calculation, match history
│   │   ├── settlementService.ts    # Settlement detection, crank triggering
│   │   ├── predictionService.ts    # Prediction pool indexing, odds calculation
│   │   └── leaderboardService.ts   # Leaderboard aggregation, caching
│   │
│   ├── db/                          # Database layer
│   │   ├── client.ts               # Postgres connection pool (pg or postgres.js)
│   │   ├── migrations/             # SQL migration files (managed by drizzle-kit or similar)
│   │   │   ├── 0001_create_matches.sql
│   │   │   ├── 0002_create_players.sql
│   │   │   └── 0003_create_leaderboard.sql
│   │   └── queries/                # Typed query functions per domain
│   │       ├── matches.ts
│   │       ├── players.ts
│   │       └── leaderboard.ts
│   │
│   ├── cache/                       # Redis caching layer
│   │   ├── client.ts               # ioredis connection + helpers
│   │   └── keys.ts                 # Cache key conventions (e.g., "match:{id}", "leaderboard:weekly")
│   │
│   └── utils/                       # Shared utilities
│       ├── fen.ts                  # FEN utilities (mirror of SDK — consider @magic-chess/utils package)
│       ├── solana.ts               # RPC connection factory, transaction helpers
│       └── errors.ts               # Fastify error handler, typed API errors
│
├── tests/
│   ├── routes/                      # Route integration tests
│   ├── services/                    # Service unit tests
│   └── helpers/                     # Test factories, fixtures
│
├── scripts/                         # Operational scripts
│   └── seed-leaderboard.ts         # Backfill leaderboard from historical data
│
├── package.json
├── tsconfig.json
├── .env.example
└── Dockerfile                       # For Railway / Fly.io / K8s deployment
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Fastify** over Express | Better perf, built-in validation (AJV), plugin system |
| **Postgres** over SQLite | Production-grade, Helius webhooks are high-throughput |
| **Redis** for caching only | Not a primary data store. Leaderboard, match list caches with TTL |
| **Drizzle or Kysely** over Prisma | Lighter weight, better SQL control, no code generation overhead |
| **Workers in-process** over separate service | Crank + indexer are simple cron jobs; no need for a queue system at MVP scale |
| **Services layer** between routes and db | Keep route handlers thin (validate input, call service, format response) |

### API Route Design

```
GET    /api/health                      → { status: "ok", uptime, db: "connected" }

GET    /api/matches                     → { matches: Match[] } with ?status=active&mint=xxx filters
GET    /api/matches/:id                 → { match: MatchDetail } with full board state

GET    /api/players/:pubkey             → { player: PlayerProfile } stats, ELO, win rate
GET    /api/players/:pubkey/matches     → { matches: Match[] }

GET    /api/leaderboard                 → { entries: LeaderboardEntry[] } with ?period=daily|weekly|all
```

### Webhook Flow

```
Helius sends webhook
  → POST /webhooks/helius
    → Verify signature (shared secret)
    → Parse event type (MatchCreated, MoveMade, GameEnded, Settlement)
    → Dispatch to appropriate service
      → Update Postgres (match state, player stats)
      → Invalidate Redis caches
      → If GameEnded: queue settlement check
```

### Crank Worker Flow

```
Every 30 seconds:
  → Query Postgres for active matches where (now - lastMoveTimestamp) > moveTimeoutDuration
  → For each timed-out match:
    → Build claim_timeout_win instruction
    → Submit transaction (platform keypair signs as fee payer, not the user)
    → On confirm: build process_match_settlement instruction
    → Submit settlement transaction
    → Update Postgres, invalidate caches
```

---

## 5. Tests

### Current Structure

```
magic-chess-program/programs/magic_chess/tests/
├── unit_tests.rs                     # Module declarations (16 lines)
├── unit/
│   ├── chess_logic.rs                # 122 tests — all piece moves, castling, checkmate, endgame
│   ├── instructions.rs               # 38 tests — instruction logic, state transitions, error paths
│   └── magicblock.rs                 # 22 tests — session keys, delegation, task IDs
│
├── litesvm.rs                        # Module declaration (11 lines)
├── litesvm/
│   ├── mod.rs                        # Harness setup: create program, fund users, mint SPL tokens
│   ├── helpers.rs                    # Shared: create_match, join_match, make_move helpers
│   ├── test_match_lifecycle.rs       # create → join → abort flow
│   ├── test_gameplay.rs             # Full game: moves, validation, checkmate
│   ├── test_settlement.rs           # SPL payout after win/draw
│   ├── test_timeout.rs              # Claim timeout, clock edge cases
│   ├── test_session_keys.rs         # Session key lifecycle
│   └── test_prediction.rs           # Prediction pool create, bet, settle, claim
│
├── mollusk/
│   ├── README.md                     # How to run CU benchmarks
│   └── cu_benchmarks.rs             # 8 benchmarks: piece moves, full game, checkmate detect
│
├── integration/
│   └── payout_full_flow.rs          # End-to-end SPL payout with token accounts
│
├── fixtures/                         # Compiled program .so for LiteSVM
│   ├── magic_chess.so
│   ├── spl_token.so
│   └── spl_associated_token_account.so
│
└── README.md                         # Test suite overview

magic-chess-program/tests/            # Anchor TypeScript tests (workspace level)
└── magic_chess.ts                     # 12 tests — anchor test runner
```

### Evaluation

| Aspect | Verdict | Notes |
|--------|---------|-------|
| **Organization by harness** | **Excellent.** | Four harnesses clearly separated: unit (no VM), litesvm (in-process SPL), mollusk (CU profiling), anchor-ts (validator). |
| **Unit test grouping** | **Good.** | Three files covering ~182 tests. Chess logic (engine), instructions (state machine), magicblock (delegation). Cohesive domains. |
| **LiteSVM grouping** | **Good.** | Six test files organized by feature. Shared harness in mod.rs + helpers.rs is the right pattern. |
| **Integration tests** | **Minor note.** | `integration/payout_full_flow.rs` uses the same LiteSVM harness as `litesvm/`. Consider moving it into `litesvm/test_settlement.rs` or renaming the directory to avoid confusion. |
| **Mollusk** | **Correct.** | Separate directory with its own README. Only CU benchmarks need the feature flag. |
| **Fixtures** | **Correct.** | Compiled .so files kept at root of tests/. |
| **Anchor TS tests** | **At workspace level.** | Standard Anchor convention. Kept separate from Rust tests. |

### Recommendation: Keep as-is

The test structure is well-organized. One small improvement:

```
integration/payout_full_flow.rs  →  litesvm/test_payout_full_flow.rs
```

Reason: It uses the same LiteSVM harness and the `integration/` directory name is misleading since LiteSVM tests are also integration tests. Moving it into `litesvm/` keeps all LiteSVM-based tests together.

### When to Split (Future Thresholds)

| Trigger | Action |
|---------|--------|
| unit/chess_logic.rs exceeds 2000 lines | Split by piece type or rule category: `unit/chess_logic/pawn.rs`, `unit/chess_logic/castling.rs`, etc. |
| litesvm/helpers.rs exceeds 200 lines | Extract into domain helpers: `litesvm/helpers/match.rs`, `litesvm/helpers/token.rs` |
| New harness added (e.g., Surfpool, Fuzz) | Top-level directory: `tests/fuzz/`, `tests/surfpool/` |

---

## 6. Cross-cutting Rules

### Naming Conventions

| Layer | Files | Structs/Classes | Functions | Variables/Atoms |
|-------|-------|-----------------|-----------|-----------------|
| **Rust (program)** | `snake_case.rs` | `PascalCase` | `snake_case` | `snake_case` |
| **Rust (tests)** | `snake_case.rs`, prefix `test_` in litesvm | — | `test_` prefix | `snake_case` |
| **TypeScript (SDK)** | `kebab-case.ts` or `camelCase.ts` | `PascalCase` | `camelCase` | `camelCase` |
| **TypeScript (frontend)** | `PascalCase.tsx` for components, `camelCase.ts` for hooks/lib | `PascalCase` (components) | `camelCase` | `camelCase` |
| **TypeScript (backend)** | `camelCase.ts` | `PascalCase` (services) | `camelCase` | `camelCase` |
| **Next.js pages** | `page.tsx`, `layout.tsx` (convention) | — | — | — |

### Import Ordering

**Rust:**
```rust
// 1. Standard library
use std::...;

// 2. External crates
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::...;

// 3. Crate modules
use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::utils::*;

// 4. Sibling modules (within instructions/)
use super::other_instruction;
```

**TypeScript:**
```typescript
// 1. External library imports
import { PublicKey } from "@solana/web3.js";
import { atom } from "jotai";

// 2. SDK/internal package imports
import { MagicChessClient } from "@magic-chess/sdk";

// 3. Local absolute imports
import { MATCH_ATOM } from "@/store/match";
import { ChessBoard } from "@/components/chess/ChessBoard";

// 4. Relative imports (same directory)
import { formatTime } from "./format";
```

### File Size Limits

| Layer | Soft Limit | Hard Limit | Action at Hard Limit |
|-------|-----------|------------|----------------------|
| **Rust instruction file** | 200 lines | 300 lines | Extract helpers into submodule |
| **Rust state file** | 100 lines | 150 lines | Split into smaller concept files |
| **Rust util file** | 500 lines | 1000 lines | Split by concern area |
| **SDK client file** | 400 lines | 500 lines | Split into domain client modules |
| **SDK types file** | 300 lines | 400 lines | Split by domain (enums, match, events) |
| **React component** | 200 lines | 300 lines | Extract sub-components or move logic to hook |
| **React hook** | 100 lines | 150 lines | Split into smaller hooks |
| **Jotai store file** | 100 lines | 150 lines | Split by sub-domain |
| **Backend service** | 300 lines | 500 lines | Split by operation type |

### When to Split vs Combine

| Situation | Action |
|-----------|--------|
| Two components share the same data dependencies | Combine into one file if combined < 200 lines. Extract shared logic into a hook. |
| A hook is used by only one component | Co-locate in the component file (not in hooks/). Move to hooks/ only when reused. |
| An instruction is < 30 lines and tightly coupled to another | Consider combining. But default to one file per instruction. |
| Three small type interfaces that are always imported together | Keep in one file. Split only when imports become selective. |
| A utility function used by exactly one module | Keep in that module. Move to utils/ only when a second consumer appears. |
| A component directory has > 10 files | Check if a sub-grouping is warranted (e.g., `chess/controls/` for board controls). |

### Module Re-export Pattern

Every module directory MUST have an `index.ts` or `mod.rs` that re-exports its public API. Consumers never import from internal files directly.

```typescript
// ✅ Correct: import from the module
import { useMatch, useMatches } from "@/hooks";

// ❌ Wrong: import from internal file
import { useMatch } from "@/hooks/useMatch";
```

```rust
// ✅ Correct: use super or crate
use crate::instructions::*;

// ✅ Correct: mod.rs re-exports
pub use initialize_match::*;
```

### Documentation Conventions

- **Every public function** in the SDK gets a JSDoc comment with `@param` and `@returns`.
- **Every instruction handler** in Rust gets a doc comment explaining what it does.
- **Every Jotai atom** gets a one-line comment explaining its purpose.
- **Component props** use TypeScript interfaces with JSDoc on non-obvious fields.

---

## 7. Visual Tree

```
magic-chess/                                    # Monorepo root
│
├── magic-chess-program/                        # Anchor workspace
│   ├── programs/magic_chess/
│   │   ├── src/
│   │   │   ├── lib.rs                          # [Dispatch] 22 instructions, entry point
│   │   │   ├── constants.rs                    # [Config] Seeds, limits, defaults (32 lines)
│   │   │   ├── errors/
│   │   │   │   └── mod.rs                      # [Errors] 40 error variants (124 lines)
│   │   │   ├── events/
│   │   │   │   └── mod.rs                      # [Events] 7 event structs (78 lines)
│   │   │   ├── instructions/                   # [Handlers] 1 file per instruction (20 files)
│   │   │   │   ├── mod.rs                      #   Grouped by: Core | MagicBlock | Prediction
│   │   │   │   ├── initialize_match.rs         #   [Core] Create match, escrow P1 tokens
│   │   │   │   ├── join_match.rs               #   [Core] P2 joins, match bet, activate
│   │   │   │   ├── abort_match.rs              #   [Core] Cancel while WaitingForOpponent
│   │   │   │   ├── make_move.rs                #   [Core] Validate + execute chess move
│   │   │   │   ├── resign_game.rs              #   [Core] Forfeit, opponent wins
│   │   │   │   ├── claim_timeout_win.rs         #   [Core] Win by opponent timeout
│   │   │   │   ├── process_match_settlement.rs  #   [Core] PDA-signed SPL payout
│   │   │   │   ├── close_match.rs              #   [Core] Return rent, close PDA
│   │   │   │   ├── delegate_match.rs           #   [MagicBlock] Lock account for ER
│   │   │   │   ├── commit_state.rs             #   [MagicBlock] Flush ER state to L1
│   │   │   │   ├── undelegate_match.rs         #   [MagicBlock] Release from ER
│   │   │   │   ├── schedule_timeout.rs          #   [MagicBlock] Queue crank timeout task
│   │   │   │   ├── cancel_timeout_task.rs       #   [MagicBlock] Cancel pending crank task
│   │   │   │   ├── set_session_key.rs          #   [MagicBlock] Authorize gasless signer
│   │   │   │   ├── revoke_session_key.rs       #   [MagicBlock] Revoke session key
│   │   │   │   ├── initialize_prediction_pool.rs # [Prediction] Create betting pool
│   │   │   │   ├── place_prediction_bet.rs     #   [Prediction] Bet on outcome
│   │   │   │   ├── settle_prediction_pool.rs    #   [Prediction] Distribute winnings
│   │   │   │   ├── claim_prediction_winnings.rs #   [Prediction] Claim share
│   │   │   │   └── cancel_prediction_bet.rs     #   [Prediction] Refund if match aborted
│   │   │   ├── state/                          # [Data] Account structs + enums (6 files)
│   │   │   │   ├── mod.rs
│   │   │   │   ├── chess_match.rs              #   ChessMatch PDA (24 fields)
│   │   │   │   ├── piece.rs                    #   Piece struct
│   │   │   │   ├── enums.rs                    #   GameStatus, PlayerColor, GameEndReason
│   │   │   │   ├── castling_rights.rs          #   CastlingRights bitmask
│   │   │   │   ├── en_passant_square.rs        #   EnPassantSquare target
│   │   │   │   └── prediction_pool.rs          #   PredictionPool PDA
│   │   │   └── utils/                          # [Logic] Pure functions (774 + 210 lines)
│   │   │       ├── mod.rs
│   │   │       ├── chess_logic.rs              #   Full FIDE engine: moves, check, endgame
│   │   │       └── payout_logic.rs             #   Fee calculation, escrow distribution
│   │   │
│   │   └── tests/                              # [Tests] 205 tests across 4 harnesses
│   │       ├── unit_tests.rs                   #   Unit test dispatcher (182 tests)
│   │       ├── unit/
│   │       │   ├── chess_logic.rs              #     122 tests — engine verification
│   │       │   ├── instructions.rs             #     38 tests — state transitions
│   │       │   └── magicblock.rs               #     22 tests — delegation + sessions
│   │       ├── litesvm.rs                      #   LiteSVM dispatcher (23 tests)
│   │       ├── litesvm/
│   │       │   ├── mod.rs                      #     Harness + program deployment
│   │       │   ├── helpers.rs                  #     Shared test helpers
│   │       │   ├── test_match_lifecycle.rs     #     Create → join → abort
│   │       │   ├── test_gameplay.rs            #     Move validation, checkmate
│   │       │   ├── test_settlement.rs          #     SPL payout after win/draw
│   │       │   ├── test_timeout.rs             #     Clock + timeout claiming
│   │       │   ├── test_session_keys.rs        #     Session key lifecycle
│   │       │   └── test_prediction.rs          #     Prediction pool flows
│   │       ├── mollusk/
│   │       │   ├── README.md                   #     How to run CU benchmarks
│   │       │   └── cu_benchmarks.rs            #     8 CU benchmarks
│   │       ├── integration/
│   │       │   └── payout_full_flow.rs         #     End-to-end SPL token flow
│   │       └── fixtures/                       #     Compiled .so files for LiteSVM
│   │           ├── magic_chess.so
│   │           ├── spl_token.so
│   │           └── spl_associated_token_account.so
│   │
│   └── tests/                                  # Anchor TS tests (workspace-level)
│       └── magic_chess.ts                      #   12 tests — anchor test runner
│
├── sdk/                                        # @magic-chess/sdk (TypeScript)
│   └── src/
│       ├── index.ts                            # [Barrel] Public API surface
│       ├── client.ts                           # [Client] MagicChessClient (434 lines)
│       ├── types.ts                            # [Types] All TS type definitions (203 lines)
│       ├── errors.ts                           # [Errors] Typed error classes
│       ├── pda.ts                              # [PDA] findChessMatchPda, findEscrowPda
│       ├── magicblock.ts                       # [MB] Constants, ER helpers
│       ├── idl.ts                              # [IDL] Re-export
│       ├── idl/magic_chess.ts                  # [IDL] Generated Anchor IDL type
│       ├── react/
│       │   └── index.ts                        # [React] Provider + 4 hooks (249 lines)
│       └── utils/
│           ├── index.ts                        #   Barrel
│           ├── fen.ts                          #   boardToFen(), fenToBoard()
│           └── pgn.ts                          #   (Future) PGN export
│
├── frontend/                                   # Next.js 15 PWA (App Router)
│   ├── app/
│   │   ├── layout.tsx                          # [Root] Providers + fonts + metadata
│   │   ├── page.tsx                            # [Page] Landing ("/")
│   │   ├── providers.tsx                       # [Client] Consolidated provider boundary
│   │   ├── arena/
│   │   │   ├── layout.tsx                      #   Arena shell: nav + wallet
│   │   │   └── page.tsx                        #   Lobby ("/arena")
│   │   ├── play/[matchId]/
│   │   │   ├── page.tsx                        #   Game view ("/play/:id")
│   │   │   └── spectate/page.tsx               #   Spectator ("/play/:id/spectate")
│   │   └── profile/
│   │       └── page.tsx                        #   Player profile ("/profile")
│   │
│   ├── components/
│   │   ├── landing/                            # Landing page sections
│   │   │   ├── Hero.tsx
│   │   │   ├── HowItWorks.tsx
│   │   │   ├── WhyMagicBlock.tsx
│   │   │   ├── GameModes.tsx
│   │   │   ├── TokenFlow.tsx
│   │   │   └── Security.tsx
│   │   ├── chess/                              # Game board + interactive UI
│   │   │   ├── ChessBoard.tsx
│   │   │   ├── ChessClock.tsx
│   │   │   ├── MoveList.tsx
│   │   │   ├── CapturedPieces.tsx
│   │   │   ├── PromotionDialog.tsx
│   │   │   ├── GameStatusOverlay.tsx
│   │   │   └── BoardControls.tsx
│   │   ├── lobby/                              # Match discovery + creation
│   │   │   ├── MatchCard.tsx
│   │   │   ├── CreateMatchForm.tsx
│   │   │   ├── JoinMatchDialog.tsx
│   │   │   └── LiveGamesFeed.tsx
│   │   ├── prediction/                         # Prediction market
│   │   │   ├── PredictionPool.tsx
│   │   │   ├── PlaceBetForm.tsx
│   │   │   └── ClaimWinningsButton.tsx
│   │   └── shared/                             # Cross-cutting components
│   │       ├── Navbar.tsx
│   │       ├── Footer.tsx
│   │       ├── WalletButton.tsx
│   │       ├── TokenDisplay.tsx
│   │       ├── TransactionStatus.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── hooks/                                  # Custom React hooks (one per file)
│   │   ├── useMatchSetup.ts                    #   create/join flow
│   │   ├── useMakeMove.ts                      #   Move submission + optimistic update
│   │   ├── useMatchPolling.ts                  #   Poll/WS match state
│   │   ├── useChessClock.ts                    #   Clock tick + urgency + timeout
│   │   ├── useSessionKey.ts                    #   IndexedDB key management
│   │   ├── useDelegation.ts                    #   Delegate/commit/undelegate
│   │   ├── useSettlement.ts                    #   Claim winnings post-game
│   │   ├── usePrediction.ts                    #   Place bet, view pool
│   │   └── useMatchEvents.ts                   #   Event subscription + dispatch
│   │
│   ├── store/                                  # Jotai atoms (pure state, no JSX)
│   │   ├── index.ts                            #   Re-exports
│   │   ├── match.ts                            #   Current match: board, status, pot
│   │   ├── lobby.ts                            #   Match list, filters
│   │   ├── wallet.ts                           #   Wallet address, balance
│   │   ├── clock.ts                            #   Clock time, urgency
│   │   ├── prediction.ts                       #   Pool data for current match
│   │   └── ui.ts                               #   Sidebars, theme, sound prefs
│   │
│   ├── lib/                                    # Pure functions (no React imports)
│   │   ├── chess.ts                            #   chess.js wrapper
│   │   ├── magicblock.ts                       #   ER connection + helpers
│   │   ├── tokens.ts                           #   SPL token metadata
│   │   ├── sounds.ts                           #   Web Audio API manager
│   │   ├── errors.ts                           #   On-chain error → user message
│   │   ├── format.ts                           #   Token amounts, clock, ELO
│   │   └── pgn.ts                              #   (Future) PGN export
│   │
│   ├── styles/
│   │   ├── globals.css                         # Tailwind + CSS custom properties
│   │   └── board-themes.ts                     # Board color presets
│   │
│   └── public/
│       ├── pieces/                             # Custom chess piece SVGs
│       ├── sounds/                             # Audio files (move, capture, end)
│       └── icons/                              # App + PWA manifest icons
│
├── backend/                                    # Fastify + Postgres + Redis (future)
│   └── src/
│       ├── index.ts                            # [Entry] Fastify server
│       ├── config.ts                           # [Config] Env vars, feature flags
│       ├── routes/                             # [API] REST endpoints
│       │   ├── index.ts
│       │   ├── matches.ts                      #   /api/matches, /api/matches/:id
│       │   ├── players.ts                      #   /api/players/:pubkey
│       │   ├── leaderboard.ts                  #   /api/leaderboard
│       │   └── health.ts                       #   /api/health
│       ├── webhooks/                           # [Webhooks] Helius inbound
│       │   ├── helius.ts
│       │   └── types.ts
│       ├── workers/                            # [Workers] Background jobs
│       │   ├── crank.ts                        #   Timeout detection + settlement
│       │   └── indexer.ts                      #   Historical account indexing
│       ├── services/                           # [Logic] Business layer
│       │   ├── matchService.ts
│       │   ├── playerService.ts
│       │   ├── settlementService.ts
│       │   ├── predictionService.ts
│       │   └── leaderboardService.ts
│       ├── db/                                 # [Database] Postgres
│       │   ├── client.ts                       #   Connection pool
│       │   ├── migrations/                     #   SQL migration files
│       │   └── queries/                        #   Typed query functions
│       │       ├── matches.ts
│       │       ├── players.ts
│       │       └── leaderboard.ts
│       ├── cache/                              # [Cache] Redis
│       │   ├── client.ts
│       │   └── keys.ts
│       └── utils/                              # [Utils] Shared helpers
│           ├── fen.ts
│           ├── solana.ts
│           └── errors.ts
│
├── docs/                                       # Documentation
│   ├── index.md                                #   Docs hub
│   ├── spec.md                                 #   Full project spec
│   ├── architecture.md                         #   System design deep-dive
│   ├── chess-engine.md                         #   On-chain chess logic
│   ├── sdk.md                                  #   SDK API reference
│   ├── security-audit.md                       #   Self-audit report (94/100)
│   ├── magicblock.md                           #   ER integration guide
│   ├── deployment.md                           #   Deployment architecture
│   ├── deployment-plan.md                      #   Mainnet launch checklist
│   ├── backend-design.md                       #   Backend architecture
│   ├── frontend-research.md                    #   UI/UX research + decisions
│   ├── token-strategy.md                       #   Token launch strategy
│   ├── fee-split.md                            #   Fee split + treasury
│   ├── hackathon.md                            #   Hackathon strategy
│   ├── mvp-order.md                            #   Build order priority
│   ├── migration-plan.md                       #   Anchor / dependency migration
│   └── folder-structure.md                     #   This file
│
├── agent-findings/                             # Historical agent research (18 reports)
│
├── .claude/                                    # Claude Code configuration
├── .agents/skills/                             # Agent skill definitions
│
├── CLAUDE.md                                   # Agent instructions
├── README.md                                   # Project README
├── DEPLOY.md                                   # Deployment guide
├── skills-lock.json                            # Skill version lockfile
├── .gitignore
└── package.json                                # (future) Root workspace package.json
```

### Annotation Key

| Prefix | Meaning |
|--------|---------|
| `[Dispatch]` | Entry point that routes to handlers |
| `[Config]` | Configuration, constants, env vars |
| `[Errors]` | Error definitions |
| `[Events]` | Event struct definitions |
| `[Handlers]` | Instruction handler implementations |
| `[Data]` | Account structs, enums, data types |
| `[Logic]` | Pure business logic, no Anchor macros |
| `[Tests]` | Test files organized by harness |
| `[Barrel]` | Re-exports public API |
| `[Client]` | SDK client class |
| `[Types]` | TypeScript type definitions |
| `[PDA]` | PDA derivation helpers |
| `[MB]` | MagicBlock-specific code |
| `[IDL]` | Anchor IDL type |
| `[React]` | React hooks + provider |
| `[Root]` | Next.js root layout |
| `[Page]` | Next.js page component |
| `[Entry]` | Server entry point |
| `[API]` | REST API route handlers |
| `[Webhooks]` | Inbound webhook handlers |
| `[Workers]` | Background cron jobs |
| `[Cache]` | Redis caching layer |
| `[Database]` | Postgres layer |
| `[Utils]` | Shared utility functions |
