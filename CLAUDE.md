# ZUG Arena (Magic Chess) — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.
The product is branded **ZUG Arena** ("Every move matters."). It is live on devnet at
https://arena.chessmagic.workers.dev. `dev` is the only branch, and feature PRs target `dev`.

## Git workflow (required for every agent and session)

`dev` is the only long-lived branch and everything deploys from it. Never commit or push directly to `dev`.

1. For any new or major piece of work, start a fresh branch from the latest `dev`:
   `git fetch origin && git checkout -b <type>/<short-description> origin/dev` (types: `feat`, `fix`, `chore`, `docs`, …).
2. Commit with Conventional Commits messages. Do not add a `Co-Authored-By: Claude` (or any Claude co-author) trailer.
3. Push the branch (`git push -u origin <branch>`) and open a PR into `dev` using `.github/PULL_REQUEST_TEMPLATE.md`.
4. Get CI green before asking for merge. Small follow-ups to an open PR go on that PR's branch; after a PR merges, new work starts a new branch from `dev`.
5. When the task is done, update this file's status and next-steps sections in the same PR.

## Project Layout

```
magic-chess/
├── magic-chess-program/        # Anchor workspace (Rust program + tests)
│   ├── programs/magic_chess/   # On-chain chess engine (21 instructions)
│   │   └── src/
│   │       ├── lib.rs          # Instruction dispatch
│   │       ├── constants.rs    # PDA seeds, validation limits
│   │       ├── errors/         # 58 error variants (6000–6057)
│   │       ├── events/         # 8 event types
│   │       ├── instructions/   # instruction handlers
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
├── frontend/                   # ZUG Arena: Next.js 15 static export on a Cloudflare Worker
├── backend/                    # Fastify + Postgres: indexer, SSE, gas sponsor, ratings
├── docs/                       # Docusaurus site (GitHub Pages, deploys from dev)
├── research/                   # Earlier R&D notes + agent-findings/ reports (reference, unmaintained)
└── .claude/                    # Claude Code settings

Local only (gitignored): .agents/skills/, .claude/skills/, skills-lock.json, marketing/
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
cargo test -p magic_chess --lib --test unit_tests

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

Installed locally (not tracked in git; reinstall from `skills-lock.json`):

- `magicblock` — MagicBlock integration (delegation, ER, session keys, crank)
- `solana-audit` — Security audit workflows and vulnerability taxonomies
- `solana-incident-response` — Incident triage and post-mortem

## Current State

Program tests: 182 unit (`--test unit_tests`) + 59 LiteSVM + 15 payout flow + 11 Mollusk CU, all run in CI.
Prediction market instructions live on-chain (`prediction_enabled` flag, 5 instructions); no outcome-pool UI yet.
Frontend (ZUG Arena) and backend are live on devnet; see `docs/docs/deployment.md`.

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

## SDK on npm: status and next steps (handoff, 2026-10-10)

`@magic-chess/sdk` (`sdk/`) had full source but couldn't be published: it shipped raw TypeScript
(`main: src/index.ts`). Branch `feat/sdk-npm-package` makes it a real package. Not published yet.

### Done
- `tsup` (`sdk/tsup.config.ts`) builds ESM + CJS + `.d.ts` for `.` and `./react` into `sdk/dist/` (gitignored).
  `package.json` has an `exports` map, `files: ["dist"]`, `publishConfig.access: public`, react as optional peer.
- `prepare` builds on `npm install`, so the frontend's `prebuild`/`predev` (`cd ../sdk && npm install --include=dev`) keep
  working; the frontend now consumes `sdk/dist`, not `sdk/src`. Editing the SDK with the frontend running:
  `cd sdk && npm run dev` (tsup watch).
- Fixed: Node ESM consumers crashed on `import { BN } from "@anchor-lang/core"` (anchor is CJS for Node).
  `client.ts` imports `BN` from `bn.js` (now a dependency).
- `sdk/test/smoke.mjs` imports the built package by name in ESM and CJS. `prepublishOnly` = typecheck +
  test + build + smoke. CI builds the SDK before the frontend typecheck and runs build + smoke + `npm pack --dry-run`.
- `.github/workflows/publish-sdk.yml` publishes on a `sdk-v<version>` tag via npm trusted publishing (OIDC).
- Publishing guide: `DEPLOY.md` → "Publish the SDK". npm README: `sdk/README.md`.

### Next steps (owner action needed)
- The owner creates the npm org `magic-chess`, runs `npm login`, does the first `npm publish` from `sdk/`,
  then adds the trusted publisher on npmjs.com (steps in `DEPLOY.md`).
- After publishing: drop the "if it isn't on npm yet" note in `docs/docs/build/sdk.md`.
- Worth doing before 1.0: a mainnet/devnet cluster option (program ID and router are devnet-only today),
  an example app (`examples/node-bot` playing via session keys), and API docs from TSDoc (typedoc).
- CJS `react` entry bundles its own copy of the client (no code splitting in CJS); fine for now, revisit if
  `instanceof MagicChessClient` across entries matters.
