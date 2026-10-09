# Contributing to Magic Chess

Thanks for helping. This guide covers setup, the test suites and how we review
changes. The full developer docs live at
<https://amalnathsathyan.github.io/magic-chess/docs/getting-started/local-setup>.

## Repository layout

| Path | What it is | Stack |
| --- | --- | --- |
| `magic-chess-program/` | On-chain chess engine, escrow, prediction pool | Rust, Anchor 1.1.2, MagicBlock ER SDK |
| `sdk/` | `@magic-chess/sdk` client, PDA helpers, React hooks | TypeScript |
| `backend/` | Indexer, realtime SSE, history, ratings, gas sponsor | Fastify 5, PostgreSQL |
| `frontend/` | ZUG Arena web app | Next.js 15 (static export), Privy, Tailwind 4 |
| `docs/` | This documentation site | Docusaurus 3 |

## Prerequisites

- Node.js 22+
- Rust 1.89 (pinned by `magic-chess-program/rust-toolchain.toml`)
- Solana CLI 2.x+ and Anchor CLI 1.1.2 (program work only)
- PostgreSQL 15+ or a Supabase project (backend work only)

## Running the tests

```bash
# Program: unit + LiteSVM + payout flow (build the .so first for LiteSVM)
cd magic-chess-program
cargo test -p magic_chess --lib --test unit_tests
cargo build-sbf            # add --tools-version v1.52 on macOS 12
cargo test -p magic_chess -- litesvm
cargo test -p magic_chess --test payout_full_flow
cargo test -p magic_chess --features integration-tests --test cu_benchmarks

# Backend (database tests run only when TEST_DATABASE_URL is set)
cd backend && npm ci && npm test

# SDK
cd sdk && npm install && npm test && npm run build && npm run smoke

# Frontend
cd frontend && npm ci && npm run typecheck && npm run lint
```

CI runs the program, frontend and SDK checks on every pull request.

## Workflow

1. Fork, then branch from `dev`: `git checkout -b fix/short-description dev`.
   Maintainers and AI agents with write access skip the fork and branch in this repo.
   Nobody pushes directly to `dev`; every change lands through a PR.
2. Keep pull requests focused. One fix or feature per PR.
3. Write commits in [Conventional Commits](https://www.conventionalcommits.org/)
   style: `fix(play): ...`, `feat(backend): ...`, `docs: ...`.
4. Open the PR against `dev` (the default branch) and fill in the template.

## Program changes

- Account layout changes break existing devnet matches. Call them out in the PR.
- After changing instructions or accounts, rebuild and copy the IDL into the SDK:
  `cd sdk && npm run sync-idl`. SDK releases follow `DEPLOY.md` → "Publish the SDK".
- Every new instruction needs a LiteSVM test that covers the unauthorized-signer
  path, not only the happy path.

## Secrets

Never commit `.env` files, keypairs or API keys. Copy `backend/.env.example` and
`frontend/.env.example` instead. Report security issues privately, see
[SECURITY.md](SECURITY.md).

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
