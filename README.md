<div align="center">
  <img src="frontend/public/brand/zug-logo-horizontal.svg" alt="ZUG" width="220"/>

  <h1>Magic Chess</h1>

  <p><strong>Fully on-chain chess on Solana, with gasless real-time moves on MagicBlock Ephemeral Rollups.</strong></p>

  [![CI](https://github.com/amalnathsathyan/magic-chess/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/amalnathsathyan/magic-chess/actions/workflows/ci.yml)
  [![Docs](https://img.shields.io/badge/docs-online-ff4f1a)](https://amalnathsathyan.github.io/magic-chess/docs/)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Network: devnet](https://img.shields.io/badge/solana-devnet-black?logo=solana)](https://explorer.solana.com/address/FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h?cluster=devnet)

  **[Play ZUG Arena](https://arena.chessmagic.workers.dev)** · **[Read the docs](https://amalnathsathyan.github.io/magic-chess/docs/)**
</div>

---

Magic Chess is an Anchor program that enforces the full FIDE rules on-chain:

- castling, en passant and promotion
- check, checkmate and stalemate
- the 50-move rule, threefold repetition and insufficient material

During a game, the match account is delegated to a MagicBlock Ephemeral Rollup. Moves there confirm in milliseconds and cost no gas. Session keys remove wallet popups. Wagers stay in a program-owned escrow on Solana L1 and pay out when the game ends.

**ZUG Arena** is the web app built on it, live on devnet at [arena.chessmagic.workers.dev](https://arena.chessmagic.workers.dev). You sign in with Privy (email, social or an external wallet like Phantom). A backend sponsor pays every network fee and rent, so players pay only their wager, and free (0-wager) games cost nothing. The app adds:

- a lobby with open games, live games and a public Recent games list
- live boards that stream moves from the rollup, with move and game-end sounds
- spectating with points-based move predictions
- a review page that replays any finished game move by move
- profiles with names, bios, avatars, Elo ratings (start 1200) and match history
- XP and levels for playing (tiers Pawn to King), and a Ladder ranked by rating with an XP tab

## Current status

- The program, ZUG Arena frontend (Cloudflare Worker) and backend (Render + Supabase Postgres) are live on **devnet**, all deployed from `dev`.
- Game creation, joining and gasless moves work end to end. Finished games show who won and why.
- Every game is stored: a chain indexer records moves as they happen, and an account reconciler sweeps the chain every 60 seconds to recover games played while the backend was down (those show the final position without individual moves).
- Not automatic yet: the task-scheduler crank is disabled, so a player claims a timeout win (embedded wallets do it automatically) and presses "Finalize and settle payout" to pay out.
- Prediction market instructions are on-chain, but there is no outcome-pool UI yet.

> **Devnet only.** Magic Chess has not been externally audited. See [SECURITY.md](SECURITY.md).

## How it works

```mermaid
flowchart LR
    subgraph L1["Solana L1"]
        Escrow["Match escrow (SPL)"]
        Match["ChessMatch PDA"]
    end
    subgraph ER["MagicBlock Ephemeral Rollup"]
        Engine["On-chain chess engine"]
    end
    App["ZUG Arena + @magic-chess/sdk"] -->|create / join / wager| Match
    Match -->|delegate| Engine
    App -->|gasless moves, session key| Engine
    Engine -->|commit + undelegate| Match
    Match -->|settle| Escrow
    Backend["Backend: indexer, SSE, gas sponsor, ratings"] -.->|reads| Match
    Backend -.->|reads| Engine
```

1. White creates a match and locks a wager (or plays for free). Black joins and matches it.
2. The match is delegated to the rollup. Both players move there with no fees.
3. When the game ends by checkmate, resignation, timeout or a draw rule, the state returns to L1. Settlement then pays the winner, minus a 1% fee, or splits the pot on a draw.

Details: [Architecture overview](https://amalnathsathyan.github.io/magic-chess/docs/architecture/overview).

## Repository layout

| Path | What it is |
|------|------------|
| [`magic-chess-program/`](magic-chess-program) | Anchor 1.1.2 program (Rust). Covers the chess engine, escrow and settlement, MagicBlock delegation, session keys and the prediction pool. |
| [`sdk/`](sdk) | [`@magic-chess/sdk`](https://amalnathsathyan.github.io/magic-chess/docs/build/sdk/): a TypeScript client with base/rollup routing, React hooks and PDA and FEN helpers |
| [`frontend/`](frontend) | ZUG Arena: a Next.js 15 static export on a Cloudflare Worker, using Privy and Tailwind 4 |
| [`backend/`](backend) | Fastify + Postgres. Runs the chain indexer, account reconciler, realtime SSE hub, gas sponsor, ratings, XP and move predictions. |
| [`docs/`](docs) | Docusaurus source for the [docs site](https://amalnathsathyan.github.io/magic-chess/docs/) |
| [`research/`](research) | Earlier R&D notes and design docs, kept for reference and no longer maintained |

## Quick start

Prerequisites:

- Node.js 22
- Rust 1.89 (pinned in `rust-toolchain.toml`)
- Solana CLI
- Anchor CLI 1.1.2

```bash
git clone https://github.com/amalnathsathyan/magic-chess.git
cd magic-chess

# Program: build and test
cd magic-chess-program
cargo build-sbf --tools-version v1.52
cd programs/magic_chess
cargo test --test unit_tests                                         # 182 unit tests
cargo test -- litesvm                                                # LiteSVM integration
cargo test --test payout_full_flow                                   # payout flows
cargo test --features integration-tests --test cu_benchmarks         # compute-unit benchmarks

# SDK
cd ../../../sdk && npm install && npm test && npm run build

# Backend (needs Postgres; see backend/.env.example)
cd ../backend && npm ci && cp .env.example .env && npm run dev

# Frontend
cd ../frontend && npm ci && npm run dev
```

The full guide is [Local setup](https://amalnathsathyan.github.io/magic-chess/docs/getting-started/local-setup).

## Documentation

- [How to play](https://amalnathsathyan.github.io/magic-chess/docs/getting-started/how-to-play)
- [Program reference](https://amalnathsathyan.github.io/magic-chess/docs/architecture/program): accounts, instructions and errors
- [MagicBlock integration](https://amalnathsathyan.github.io/magic-chess/docs/architecture/magicblock)
- [TypeScript SDK](https://amalnathsathyan.github.io/magic-chess/docs/build/sdk/) ([npm release steps](DEPLOY.md#publish-the-sdk-magic-chesssdk))
- [Building agents](https://amalnathsathyan.github.io/magic-chess/docs/build/agents)
- [Security reviews](https://amalnathsathyan.github.io/magic-chess/docs/security/overview)
- [Roadmap](https://amalnathsathyan.github.io/magic-chess/docs/roadmap)

## Development workflow

`dev` is the only long-lived branch and the one everything deploys from. Every piece of new or major work, whether by a person or an AI agent (Claude Code CLI, cloud sessions), follows the same flow:

1. Start a new branch from the latest `dev`: `git fetch origin && git checkout -b feat/short-description origin/dev`.
2. Commit there in [Conventional Commits](https://www.conventionalcommits.org/) style.
3. Push the branch and open a pull request into `dev`, using the PR template.
4. Merge once CI is green and the PR is reviewed.

Don't commit or push straight to `dev`. Small follow-ups to an open PR go on that PR's branch; once a PR is merged, new work starts a new branch.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and follow the workflow above. Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
