# Magic Speed Chess — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.

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
