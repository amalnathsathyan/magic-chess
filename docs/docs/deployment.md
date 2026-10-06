---
sidebar_position: 6
---

# Deployment

| Piece | Where it runs | Source | How it ships |
|-------|---------------|--------|--------------|
| Program | Solana devnet, `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` | `magic-chess-program/` | Manual `anchor deploy` |
| Frontend (ZUG Arena) | Cloudflare Worker at [arena.chessmagic.workers.dev](https://arena.chessmagic.workers.dev) | `frontend/` | Cloudflare Workers Builds on push |
| Backend | Render at `magic-chess-dev.onrender.com` | `backend/` | Render deploy on push |
| Database | Supabase Postgres | `backend/src/db/migrate.ts` | Migrations run at backend start (`RUN_MIGRATIONS_ON_START`) |
| Docs | GitHub Pages | `docs/` | `.github/workflows/deploy-docs.yml` on push to `main` |

## Program

```bash
cd magic-chess-program
cargo build-sbf --tools-version v1.52    # v1.52 works on macOS 12
solana config set --url devnet
anchor deploy --provider.cluster devnet
anchor idl upgrade --provider.cluster devnet \
  --filepath target/idl/magic_chess.json FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h

# Ship the new IDL to the SDK and frontend
cd ../sdk && npm run sync-idl
```

An upgrade needs the upgrade authority keypair. `DEPLOY.md` in the repo root covers Surfpool, devnet, MagicBlock and troubleshooting in detail.

:::warning
Keypairs (`*-keypair.json`) are gitignored. Never commit them.
:::

## Frontend

The frontend is a static Next.js export served by a Cloudflare Worker.

| Setting | Value |
|---------|-------|
| Root directory | `frontend/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Config | `frontend/wrangler.toml` |

Public settings (`NEXT_PUBLIC_*`, such as the API URL, Privy app ID and RPC endpoints) are in the `[vars]` block of `wrangler.toml`. They are baked in at build time, so a change needs a rebuild. The worker also redirects old `/play/<id>` links to `/play?id=<id>`.

## Backend

The backend is a Fastify service on Render.

| Setting | Value |
|---------|-------|
| Root directory | `backend/` |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `GET /health` |

The required environment variables are listed in `backend/.env.example` and in [Backend → Configuration](./architecture/backend.md#configuration):

- the database URL
- `RPC_ENDPOINT` (use a dedicated devnet RPC; the public one rate-limits)
- Privy app ID and verification key
- sponsor keypair
- `CORS_ORIGIN`

On Render's free tier the service sleeps when idle. The frontend tolerates a cold backend, but the first request after a sleep is slow.

## Docs

```bash
cd docs
npm ci
npm run build   # fails on broken links
npm run serve
```

A push to `main` that touches `docs/` builds and publishes to `https://amalnathsathyan.github.io/magic-chess/`.
