---
sidebar_position: 2
title: Local setup
---

# Local setup

Run the program tests, the backend and the app on your machine. Each package
installs and runs on its own, so set up only what you are changing.

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22+ | backend, frontend, SDK, docs |
| Rust | 1.89 (pinned in `magic-chess-program/rust-toolchain.toml`) | program |
| Solana CLI (Agave) | 2.x+ | program build and deploy |
| Anchor CLI | 1.1.2 | IDL generation, deploy, TS tests |
| PostgreSQL | 15+ (or a Supabase project) | backend |

```bash
git clone https://github.com/amalnathsathyan/magic-chess.git
cd magic-chess
```

## Program

```bash
cd magic-chess-program

# Pure Rust tests: chess rules, payout math, instruction logic
cargo test -p magic_chess --lib
cargo test -p magic_chess --test unit_tests

# Build the .so (needed by LiteSVM and Mollusk tests)
cargo build-sbf
# macOS 12 only: platform tools v1.54 crash there, use v1.52
cargo build-sbf --tools-version v1.52

# In-process SVM tests: escrow, settlement, sessions, security, predictions
cargo test -p magic_chess -- litesvm
cargo test -p magic_chess --test payout_full_flow

# Compute-unit benchmarks
cargo test -p magic_chess --features integration-tests --test cu_benchmarks
```

The Anchor TypeScript tests in `tests/*.ts` run against devnet and MagicBlock:

```bash
npm install
anchor test --skip-deploy   # uses the cluster in Anchor.toml (devnet)
```

After changing instructions or accounts, refresh the SDK's copy of the IDL:

```bash
anchor build
cd ../sdk && npm run sync-idl
```

## Backend

```bash
cd backend
cp .env.example .env
```

Set at least `DATABASE_URL`. A local Postgres works
(`postgres://postgres:postgres@localhost:5432/magic_chess`). For gas sponsoring,
also set `SOLANA_FEE_PAYER_PRIVATE_KEY` to a funded **devnet** keypair and
`PRIVY_APP_ID` to your Privy app. See [Backend](../architecture/backend.md) for
every variable.

```bash
npm ci
npm run migrate   # create tables
npm run dev       # http://localhost:3001
npm test          # unit tests; DB tests need TEST_DATABASE_URL
```

## Frontend

```bash
cd frontend
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_PRIVY_APP_ID` (create an app at
[dashboard.privy.io](https://dashboard.privy.io) and allow `http://localhost:3000`),
`NEXT_PUBLIC_API_URL=http://localhost:3001` and
`NEXT_PUBLIC_PLATFORM_FEE_WALLET`.

```bash
npm ci            # links ../sdk through a file: dependency
npm run dev       # builds ../sdk first (predev), then http://localhost:3000
npm run typecheck && npm run lint
```

The app talks to the program already deployed on devnet. To use your own
deployment, change `NEXT_PUBLIC_PROGRAM_ID` here and `PROGRAM_ID` in the backend.

## SDK

```bash
cd sdk
npm install
npm run typecheck
npm test
npm run build     # writes dist/ (ESM, CJS, .d.ts), which the frontend imports
npm run smoke     # loads the built package the way an npm user would
```

The frontend imports the built `dist/`, not `src/`. When you change the SDK while the frontend's dev
server runs, keep `npm run dev` going in `sdk/` so `dist/` rebuilds on save. Publishing is covered in
[`DEPLOY.md`](https://github.com/amalnathsathyan/magic-chess/blob/dev/DEPLOY.md#publish-the-sdk-magic-chesssdk).

## Docs

```bash
cd docs
npm ci
npm start         # http://localhost:3000/magic-chess/
npm run build     # fails on broken links
```

## Where to go next

- [Architecture overview](../architecture/overview.md)
- [Contributing guide](https://github.com/amalnathsathyan/magic-chess/blob/dev/CONTRIBUTING.md)
