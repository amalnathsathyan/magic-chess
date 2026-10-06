# Agent 10: Backend + Indexing Plan

## Status: ✅ Complete — No code changes

## Architecture: $0/month MVP

```
Browser → Fastify API → Postgres + Redis (Railway)
                       ↑
                 Helius Webhooks ← Solana Devnet
```

### Technology Choices
| Layer | Choice | Why |
|-------|--------|-----|
| API | Fastify (Node.js) | Fast, native TS, same language as frontend |
| DB | PostgreSQL (Railway managed) | Free tier, relational queries |
| Cache | Upstash Redis (free tier) | Pub/sub for WebSocket fan-out |
| Indexing | Helius Enhanced Webhooks | Free tier (1M events), Anchor event decoding |
| WS | @fastify/websocket | Same process, shares Redis pub/sub |
| ORM | Drizzle ORM | Matches Next.js stack, type-safe |
| Crank | node-cron (30s polling) | Simple, idempotent |
| Hosting | Railway | Free managed Postgres, no cold starts |

### Database Schema (8 tables)
- `matches` — indexed game state
- `moves` — move history with FEN
- `player_stats` — aggregated win/loss/ELO
- `elo_history` — rating changes over time
- `prediction_pools`, `prediction_bets` — future
- `webhook_events` — idempotency + audit log
- `reward_claims` — token claim tracking

### API Endpoints
```
GET  /api/matches?status=joinable     → Lobby
GET  /api/matches/:matchId            → Match detail + FEN
GET  /api/matches/:matchId/history     → Move list
GET  /api/matches/:matchId/export      → PGN export
GET  /api/leaderboard                  → Top players by ELO
GET  /api/players/:address/stats       → Player profile
WS   /ws/matches/:matchId              → Real-time game stream
WS   /ws/lobby                         → Real-time lobby updates
```

### Cost Estimate
| Component | Hackathon | 1K games/day |
|-----------|-----------|---------------|
| Helius | $0 | $49/mo |
| Railway | $0 | $5/mo |
| Redis | $0 (Upstash free) | $0 |
| **Total** | **$0/mo** | **$54/mo** |
