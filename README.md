# Magic Speed Chess

On-chain FIDE chess engine on Solana with gasless, zero-confirmation gameplay powered by [MagicBlock](https://magicblock.gg) Ephemeral Rollups.

**205 tests. 22 instructions. 40 error variants. One of a kind on Solana.**

## Features

- **Complete FIDE chess logic** — all piece moves, castling, en passant, promotion, check, checkmate, stalemate, 50-move rule, threefold repetition, insufficient material
- **Two game modes** — Blitz (3 min/move) and Standard (15 min/move), configurable per match
- **Wager matches** — SPL token escrow with automated payout (winner takes pot minus platform fee; draw refunds both players)
- **MagicBlock gasless gameplay** — all chess moves execute on Ephemeral Rollup with zero gas and zero wallet popups
- **Session keys** — sign once per match, then play every move seamlessly via hot-wallet signing
- **Crank automation** — timeout detection, settlement, and undelegation handled automatically; no off-chain bot needed
- **Prediction markets** — parimutuel betting on match outcomes (infrastructure in place)
- **TypeScript SDK** (`@magic-chess/sdk`) — React hooks, FEN utilities, PDA helpers, MagicBlock connection routing

---

## Quick Start

### Prerequisites

- Node.js 18+, Rust 1.89+, Solana CLI 4.1+, Anchor 1.1.2, Yarn

### Install & Build

```bash
git clone https://github.com/amalnathsathyan/magic-chess.git
cd magic-chess
yarn install
cd magic-chess-program && cargo build-sbf --tools-version v1.52
```

### Test

```bash
# Unit tests (182 pure Rust, ~0s)
cd magic-chess-program && cargo test -p magic_chess

# LiteSVM integration (23 in-process, full SPL token flows)
cd magic-chess-program/programs/magic_chess && cargo test -- litesvm

# Mollusk CU benchmarks (8 benchmarks)
cargo test --features integration-tests -p magic_chess --test cu_benchmarks

# Anchor TypeScript tests (12, requires local validator)
cd magic-chess-program && anchor test
```

**205 tests across 4 harnesses**: 182 unit + 23 LiteSVM + 8 Mollusk CU + 12 Anchor TS.

### Deploy (Devnet)

```bash
cd magic-chess-program
cargo build-sbf --tools-version v1.52
anchor deploy --provider.cluster devnet
```

See [DEPLOY.md](./DEPLOY.md) for Surfpool, Devnet, and MagicBlock deployment paths.

---

## Architecture

Magic Speed Chess uses MagicBlock Ephemeral Rollups to split game state between Solana L1 (where tokens and final settlement live) and an Ephemeral Rollup validator (where all chess moves execute with instant finality). Tokens never leave L1; the ER handles only gameplay logic.

```
                    L1 (Solana)                              ER (MagicBlock)
                    =========                                ================

initialize_match                                              [inactive]
  - Creates ChessMatch PDA
  - Creates escrow token PDA
  - Transfers P1 USDC → escrow

join_match                                                    [inactive]
  - Transfers P2 USDC → escrow
  - game_status = Active

delegate_match ──────🔒────────────────────────────────────── ChessMatch delegated
  - CPI to Delegation Program                                  - Account locked on L1

[inactive]                                                    set_session_key (once per player)
[inactive]                                                    make_move × N (session key, 0 popups)
[inactive]                                                    game ends (checkmate/stalemate/timeout)
[inactive]                                                    commit_state → undelegate_match ──🔓──→

process_match_settlement
  - PDA signs SPL transfer
  - USDC distributed: winner + platform fee
  - payout_processed = true

close_match
  - Return rent lamports, clean up PDA
```

**Two PDAs per match:**
- `chess_match` (seeds: `["chess_match", match_id]`) — full game state, 24 fields
- `match_escrow` (seeds: `["match_escrow", match_id]`) — SPL token account, PDA-owned

**State machine:** `WaitingForOpponent` → `Active` → Terminal (`WhiteWins` | `BlackWins` | `Draw`)

---

## Program Instructions

### Game Lifecycle
| Instruction | Description |
|---|---|
| `initialize_match` | Create match, escrow Player 1's bet |
| `join_match` | Join as Player 2, match bet, start game |
| `make_move` | Submit and validate a chess move |
| `resign_game` | Forfeit — opponent wins |
| `claim_timeout_win` | Claim win when opponent exceeded move timeout |
| `process_match_settlement` | Distribute escrowed tokens (win/draw) |
| `abort_match` | Cancel match stuck in WaitingForOpponent |
| `close_match` | Return rent lamports after settlement |

### MagicBlock Ephemeral Rollups
| Instruction | Description |
|---|---|
| `delegate_match` | Delegate match account to MagicBlock ER |
| `commit_state` | Commit ER state back to Solana L1 |
| `undelegate_match` | Release match from ER delegation |
| `schedule_timeout` | Schedule crank task for timeout claiming |
| `cancel_timeout_task` | Cancel pending timeout crank task |
| `set_session_key` | Authorize session key for gasless moves |
| `revoke_session_key` | Revoke active session key |

### Prediction Markets
| Instruction | Description |
|---|---|
| `initialize_prediction_pool` | Create betting pool for match |
| `place_prediction_bet` | Bet on White, Black, or Draw |
| `settle_prediction_pool` | Distribute winnings after match ends |
| `claim_prediction_winnings` | Claim share of settled pool |
| `cancel_prediction_bet` | Refund if match never starts |

---

## SDK

```bash
npm install @magic-chess/sdk
```

- **`MagicChessClient`** — typed methods for createMatch, joinMatch, makeMove, resign, claimTimeout, settleMatch
- **React hooks** — `useMatch`, `useMatches`, `usePlayerMatches`, `useMatchEvents`
- **FEN utilities** — `boardToFen()`, `fenToBoard()`
- **PDA helpers** — `findChessMatchPda()`, `findMatchEscrowPda()`, `findPredictionPoolPda()`
- **MagicBlock** — constants, `getDelegationStatus()`, `getERConnection()`

See [docs/sdk.md](./docs/sdk.md) for full API reference.

---

## Signing Flow

Only **4 wallet confirmations** per player regardless of move count:

| Step | Confirmations |
|---|---|
| Create/join match + escrow | 1 |
| Delegate to MagicBlock | 1 |
| Set session key | 1 |
| All moves (× N) | **0** (session key) |
| Settlement | 1 |
| **Total** | **4** |

---

## Gas Model

| Step | Layer | Cost | Sponsor |
|---|---|---|---|
| `initialize_match` / `join_match` | L1 | ~$0.000005 SOL | User |
| `delegate_match` | L1 | ~$0.001 SOL | Platform |
| All chess moves | ER | **FREE** | MagicBlock |
| `commit_state` | ER→L1 | **FREE** (10 free) | MagicBlock |
| `undelegate_match` | ER→L1 | ~$0.06 SOL | MagicBlock |
| Settlement | L1 | ~$0.000005 SOL | User/Platform |
| **Total per match** | | **~$0.07** | Platform |

---

## Security

- **PDA-based escrow** — only program (via derived PDA signer) can move escrowed tokens
- **All signer checks** validated against registered players in ChessMatch
- **Token mint and ownership constraints** on every instruction
- **Double-payout prevention** via `payout_processed` flag (idempotent settlement)
- **Integer overflow protection** via `checked_add/mul/div/sub` throughout
- **Account re-initialization** prevented by Anchor `init` constraint
- **State machine enforcement** — strictly one-way
- **Arbitrary CPI safe** — all token transfers use `Program<'info, Token>`
- **Ring buffer** limits position history to 200 entries

Full security audit with all 13 findings: [docs/security-audit.md](./docs/security-audit.md) (score: 94/100).

---

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| **Anchor 1.1.2** | Required by ephemeral-rollups-sdk 0.16.2 |
| **Generic SPL token support** | Any mint accepted, no hardcoded addresses |
| **Tokens stay on L1, ER = game engine** | Simpler security; no cross-layer token reconciliation |
| **FNV-1a Zobrist hashing** | O(1) insert, O(n) threefold repetition scan |
| **Idempotent settlement** | `payout_processed` flag safe for crank retries |
| **Parimutuel prediction markets** | Proportional payout, no counterparty risk |
| **Privy for auth** (planned) | Google/email → embedded wallet; MagicBlock-recommended |
| **Next.js 15 + PWA** | Web-first for hackathon; PWA for near-native mobile |
| **Jotai for state** | Atomic, simpler than Redux for game state |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana (devnet) |
| Smart Contract | Anchor 1.1.2 (Rust), Solana 2.x crates |
| Scaling | MagicBlock Ephemeral Rollups (SDK 0.16.2) |
| Auth | Privy (Google/email → embedded wallet) |
| Gas Sponsorship | Privy + MagicBlock free ER transactions |
| Frontend | Next.js 15, React 19, Tailwind CSS 4, PWA |
| Chess Board | react-chessboard v5 |
| State Management | Jotai |
| UI Components | Radix UI + shadcn/ui |
| SDK | @magic-chess/sdk (TypeScript) |
| Testing | Rust unit + LiteSVM + Mollusk CU + Anchor TS |
| Indexing (planned) | Helius Webhooks + PostgreSQL |
| Backend (planned) | Fastify + Redis |

---

## Project Structure

```
magic-chess/
├── magic-chess-program/            # Anchor workspace (Rust program + tests)
│   ├── programs/magic_chess/src/
│   │   ├── lib.rs                  # Instruction dispatch (22 instructions)
│   │   ├── constants.rs            # PDA seeds, validation limits
│   │   ├── errors/                 # 40 error variants
│   │   ├── events/                 # 6 event types
│   │   ├── instructions/           # 22 instruction handlers
│   │   ├── state/                  # ChessMatch, CastlingRights, Piece, Enums, PredictionPool
│   │   └── utils/                  # chess_logic.rs (full engine), payout_logic.rs
│   └── tests/                      # Unit + LiteSVM + Mollusk CU + Anchor TS
├── sdk/                            # @magic-chess/sdk TypeScript SDK
│   └── src/
│       ├── client.ts               # MagicChessClient
│       ├── types.ts                # All TypeScript types
│       ├── pda.ts                  # PDA derivation helpers
│       ├── react/index.ts          # React hooks
│       ├── utils/fen.ts            # boardToFen, fenToBoard
│       └── magicblock.ts           # MagicBlock endpoints, delegation helpers
├── frontend/                       # Next.js 15 PWA (scaffolded, ready for build)
├── backend/                        # Fastify + Redis (planned)
├── docs/                           # Architecture, deployment, design docs
├── agent-findings/                 # 18 agent research reports (historical)
├── .agents/skills/                 # Agent skills: magicblock, solana-audit, solana-incident-response
├── CLAUDE.md                       # Agent instructions — read this first
├── DEPLOY.md                       # Full deployment guide (Surfpool/Devnet/MagicBlock)
├── skills-lock.json                # Skill version lockfile
└── README.md
```

---

## Remaining Work (Priority Order)

| Priority | Task | Status |
|---|---|---|
| **NOW** | Deploy to Solana devnet + MagicBlock devnet | Ready |
| **NOW** | Run full test suite on devnet | Ready |
| **NOW** | Build frontend (Next.js 15 + chess board + wallet) | Scaffolded |
| HIGH | Add platform fee ATA owner constraint | 1 line |
| HIGH | Add duplicate mutable account check in settlement | 2 lines |
| MEDIUM | Frontend: create/join match UI, game board, move submission | — |
| MEDIUM | MagicBlock devnet integration testing (session keys, crank) | — |
| MEDIUM | Privy auth + embedded wallet integration | — |
| LOW | Kani formal verification for board initialization | Research |
| POST-MVP | Prediction market UI + frontend integration | — |

---

## Links

- [CLAUDE.md](./CLAUDE.md) — Agent instructions (read first)
- [DEPLOY.md](./DEPLOY.md) — Step-by-step deployment guide
- [docs/spec.md](./docs/spec.md) — Full project specification
- [docs/security-audit.md](./docs/security-audit.md) — Self-audit report (94/100, 13 findings)
- [docs/architecture.md](./docs/architecture.md) — Architecture deep-dive
- [docs/chess-engine.md](./docs/chess-engine.md) — Chess engine verification
- [docs/magicblock.md](./docs/magicblock.md) — MagicBlock integration guide
- [docs/sdk.md](./docs/sdk.md) — TypeScript SDK API reference
- [docs/deployment.md](./docs/deployment.md) — Deployment architecture
- [docs/deployment-plan.md](./docs/deployment-plan.md) — Mainnet launch checklist
- [docs/backend-design.md](./docs/backend-design.md) — Off-chain backend design
- [docs/token-strategy.md](./docs/token-strategy.md) — Token launch strategy
- [docs/fee-split.md](./docs/fee-split.md) — Fee split & treasury design
- [docs/hackathon.md](./docs/hackathon.md) — Hackathon showcase strategy
- [agent-findings/](./agent-findings/) — 18 agent research reports

## License

MIT
