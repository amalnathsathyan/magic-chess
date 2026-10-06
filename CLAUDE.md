# ZUG Arena (Magic Chess) — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.
The product is branded **ZUG Arena** ("Every move matters."). It is live on devnet at
https://arena.chessmagic.workers.dev. `dev` is the only branch, and feature PRs target `dev`.

## Project Layout

```
magic-chess/
├── magic-chess-program/        # Anchor workspace (Rust program + tests)
│   ├── programs/magic_chess/   # On-chain chess engine (22 instructions)
│   │   └── src/
│   │       ├── lib.rs          # Instruction dispatch
│   │       ├── constants.rs    # PDA seeds, validation limits
│   │       ├── errors/         # 40 error variants
│   │       ├── events/         # 6 event types
│   │       ├── instructions/   # 22 instruction handlers
│   │       ├── state/          # ChessMatch, CastlingRights, Piece, Enums, PredictionPool
│   │       └── utils/          # chess_logic.rs (full engine), payout_logic.rs
│   └── tests/                  # Unit + LiteSVM + Mollusk CU + Anchor TS
├── sdk/                        # @magic-chess/sdk TypeScript SDK
│   └── src/
│       ├── client.ts           # MagicChessClient
│       ├── types.ts            # All TypeScript types
│       ├── pda.ts              # PDA derivation
│       ├── react/index.ts      # React hooks (useMatch, useMatches, usePlayerMatches)
│       ├── utils/fen.ts        # boardToFen, fenToBoard
│       └── magicblock.ts       # MagicBlock endpoints, delegation helpers
├── frontend/                   # Next.js 15 static export on a Cloudflare Worker (ZUG brand)
│   ├── app/                    # arena (lobby), play, spectate, review, profile, leaderboard (Ladder)
│   ├── components/brand/       # ZugLogo (symbol, wordmark, lockup)
│   └── public/brand/           # Logo SVG/PNGs, OG image, 2:1 Privy logos
├── backend/                    # Fastify + Postgres (Supabase) on Render
│   └── src/services/           # chainIndexer, matchReconciler, eventIngest, rating, xp, solanaSponsor
├── docs/                       # Architecture, deployment, design docs
├── agent-findings/             # 18 agent research reports (historical)
├── .agents/skills/             # Agent skills: magicblock, solana-audit, solana-incident-response
├── .claude/                    # Claude Code settings
└── skills-lock.json            # Skill version lockfile
```

## Key Technical Details

- **Anchor 1.1.2**, Rust, Solana 2.x crates
- **Program ID**: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
- **Build**: `cargo build-sbf --tools-version v1.52` (macOS 12 compat)
- **MagicBlock**: Ephemeral Rollups via delegation program `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- **Crank**: Task Scheduler `Magic11111111111111111111111111111111111111`
- **Session Keys**: `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`

## Architecture

Two PDAs per match:
- `chess_match` (seeds: `["chess_match", match_id]`) — full game state, board, players, status
- `match_escrow` (seeds: `["match_escrow", match_id]`) — SPL token account, PDA-owned

State machine: `WaitingForOpponent` → `Active` → Terminal (`WhiteWins` | `BlackWins` | `Draw`)

L1 holds tokens + settlement. ER handles gameplay (make_move, session keys, crank). Tokens never leave L1.

### Off-chain data flow

- **Chain is the source of truth.** The frontend reads open games and "your past matches" straight from
  the chain through the SDK. Live games, the global Recent games list, review/replay, profiles, the
  Ladder and XP are all served by the backend from Postgres.
- **Two writers keep Postgres in sync, and both are idempotent:**
  1. `chainIndexer.ts` follows transaction logs (base layer for create/join/settle, the rollup for moves)
     and applies program events through `eventIngest.ts`. This is the only source of individual moves.
  2. `matchReconciler.ts` (new) sweeps every `ChessMatch` account every 60s, both program-owned on base and
     delegated ones read from the rollup. It inserts missing games and applies joins, results, the final
     position and payouts. This recovers games played while the server slept or the DB was down. Moves
     can't be recovered this way, so such games show the final board with a note that moves are missing.
- Results from either path go through `updatePlayerStats` (Elo + stats + XP) behind a status guard, so a
  game is never counted twice.
- **Elo** (`rating.ts`): starts at 1200; K=40 for a player's first 30 rated games, then 20.
- **XP** (`xp.ts`, `xpLedger.ts`): every award is a row in `xp_events` (player, match, kind), and the
  running total is `player_stats.xp`. Per game: 10 for playing, +20 for a win or +8 for a draw, +1 per full
  move past move 10 (max +15), and +25 for the first win of the UTC day. A game under 6 plies earns 2 XP;
  after 5 games against the same opponent on the same day, games earn nothing. Level L→L+1 costs
  100+25·(L−1) XP. Tiers: Pawn 1, Knight 5, Bishop 10, Rook 15, Queen 20, King 30.
- **Migrations** run on backend start (`backend/src/db/migrate.ts`, 001–008). `/api/health` reports DB
  readiness, the DB error with a fix hint, stored row counts, and indexer/reconciler status.

## Testing

```bash
# Unit tests (pure Rust, ~0s)
cargo test -p magic_chess

# LiteSVM integration (in-process, SPL token flows)
cd magic-chess-program/programs/magic_chess && cargo test -- litesvm

# Mollusk CU benchmarks
cargo test --features integration-tests -p magic_chess --test cu_benchmarks

# Anchor TypeScript tests (requires local validator)
cd magic-chess-program && anchor test

# Backend (DB tests run only when TEST_DATABASE_URL points at a scratch Postgres)
cd backend && npm run typecheck && TEST_DATABASE_URL=postgres://... npm test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

## Deploy

See `DEPLOY.md` for full instructions. Quick:
```bash
cd magic-chess-program
cargo build-sbf --tools-version v1.52
anchor deploy --provider.cluster devnet
```

## Active Skills

- `magicblock` — MagicBlock integration (delegation, ER, session keys, crank)
- `solana-audit` — Security audit workflows and vulnerability taxonomies
- `solana-incident-response` — Incident triage and post-mortem

## Project status (2026-10-06)

Shipped on `dev`:
- Gasless play: the backend sponsor relay pays all fees and rent. MagicBlock session keys give instant
  moves on the rollup, and boards stream live over the rollup websocket.
- Public match history: the lobby lists everyone's finished games, `/review?id=` shows the final board,
  moves and replay controls, and `/profile?address=` is a public profile with an editable name, bio and
  avatar, signed by the wallet.
- Elo ratings, the Ladder, and the ZUG brand across the app (PR #47).
- XP, levels and tiers; account reconciliation; `/api/health` diagnostics; a GitHub Actions ping that keeps
  the Render backend awake (`.github/workflows/backend-keepalive.yml`).

Known infrastructure facts:
- `DATABASE_URL` on Render must be Supabase's **Session pooler** string (`…pooler.supabase.com:5432`). The
  direct `db.<ref>.supabase.co` host is IPv6-only and Render can't reach it (ENETUNREACH). Until
  2026-10-06 this left the DB empty. Never commit the password.
- The program deployed on devnet is older than the source here. The backend decoders read only fields
  that both layouts share, and read the wager tail best-effort.
- `NEXT_PUBLIC_*` values are baked in at build time (`frontend/.env.production`), not read from Worker vars.
- Tests: Rust 205 (unit, LiteSVM, Mollusk, Anchor TS); backend 67 (node:test, including Postgres
  integration tests).

## Next steps

1. Confirm the DB fix on the live app: `/api/health` should show `"db":"connected"` and growing `stored`
   counts, and `indexer.accounts.lastSuccessAt` should be recent. Then check that the lobby's Live and
   Recent games lists fill.
2. Games played before the fix come back through reconciliation without their moves. Consider whether to
   keep them or hide them from the Recent games list.
3. Settle finished games automatically: re-enable the task-scheduler crank or settle from the backend, so
   players don't have to claim timeouts or press "Finalize and settle payout".
4. XP polish: show "+N XP" on the game-over screen, add achievements and seasonal Ladder resets.
5. Upgrade the devnet program to the current source. Then remove the best-effort decoding.
6. PWA (issue #28, deferred).

## Gameplay: status and next steps

Fixed after jason's live test (2026-10-06):
- The page no longer jumps on phones: `MoveList` scrolled the whole page with `scrollIntoView` on every re-render (once a second), which also cancelled touch drags.
- "Confirming transaction…" no longer hangs: `runTransaction` in `frontend/app/play/page.tsx` stopped awaiting the backend history call (the DB can be asleep). That pending state also locked the board, which is why moves failed.
- Create and join confirm faster: the gas sponsor (`backend/src/services/solanaSponsor.ts`, `confirmFast`) polls the signature status instead of waiting only on the RPC websocket. An open match also polls every 1.5s so the creator sees the join.
- Finished games say who won and why (timeout, resignation, checkmate, draws) above the board.
- When the side to move runs out of time, both players see it. An embedded (Privy) wallet claims the timeout win itself, without a popup (`claim_timeout_win` is in the quiet-signing list). External wallets get the "Claim timeout win" button.
- Sounds play for the opponent's moves and for game start and end, and all sounds are unlocked on the first tap so phones play them.

Next steps:
- Timeouts still need a claim and "Finalize and settle payout" still needs a press, because the task-scheduler crank is disabled. Re-enabling the crank (or settling from the backend) would end games with no action from players.
- Not verified on a real phone yet; retest drag and tap moves, sound and the bottom nav on iOS Safari and Android Chrome.
