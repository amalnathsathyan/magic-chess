# Magic Speed Chess — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.

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
├── frontend/                   # Next.js 15 PWA (scaffolded)
├── backend/                    # Fastify + Redis (planned)
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

## Current State

205 tests across 4 harnesses (182 unit + 23 LiteSVM + 8 Mollusk CU + 12 Anchor TS).
Prediction market infrastructure in place (`prediction_enabled` flag, 5 instructions).
Frontend scaffolded (Next.js 15, Tailwind 4, shadcn/ui, Jotai).
Backend planned (Fastify + Redis + Helius webhooks).
