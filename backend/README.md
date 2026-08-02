# Magic Chess Backend

Fastify + TypeScript backend for Magic Chess — event indexing, match history, player stats, and ELO ratings.

## Tech Stack

- **Fastify 5** — high-performance Node.js HTTP framework
- **TypeScript**
- **PostgreSQL** — primary database (match history, player profiles, ELO ratings)
- **Redis** — caching and real-time match state
- **Helius Webhooks** — on-chain event ingestion and indexing
- **Railway** — hosting (PostgreSQL + Redis included)

## Architecture

The backend ingests on-chain events via **Helius webhooks** and indexes them into PostgreSQL. Match history, player statistics, and ELO ratings are derived from indexed events. Redis is used for caching hot data (active matches, leaderboard) and rate limiting.

## API Routes

| Route               | Method | Description                                  |
|---------------------|--------|----------------------------------------------|
| `/health`           | GET    | Health check — DB and Redis connectivity      |
| `/matches`          | GET    | List matches (paginated, filterable)          |
| `/matches/:id`      | GET    | Single match detail with move history         |
| `/players/:address` | GET    | Player profile — stats, ELO, match history    |
| `/leaderboard`      | GET    | Top players by ELO rating                     |
| `/stats`            | GET    | Global stats — total matches, volume, etc.    |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run locally (requires PostgreSQL and Redis)
npm run dev
```

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/magicchess
REDIS_URL=redis://localhost:6379
HELIUS_WEBHOOK_SECRET=<webhook-signing-secret>
RPC_ENDPOINT=https://api.devnet.solana.com
PROGRAM_ID=<deployed-program-id>
PORT=3001
```

## Webhook Events Indexed

- `initialize_match` — new match created
- `join_match` — player joined, match started
- `make_move` — each move recorded with FEN snapshot
- `resign_game` — player forfeited
- `claim_timeout_win` — timeout victory
- `process_match_settlement` — payout distributed

## References

- [Helius Webhooks Docs](https://docs.helius.dev)
- [Fastify Documentation](https://fastify.dev)
- [Project Architecture](../docs/architecture.md)
- [Project Specification](../SPEC.md)
