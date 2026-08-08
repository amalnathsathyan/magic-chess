# Backend — Current State & Integration Plan

> Updated 2026-08-08. For the agent wiring backend↔frontend integration.
> Backend is built, running, and tested against Supabase PostgreSQL. Frontend sync not yet wired.

## Running Instance

```
localhost:3001/api/health → {"status":"ok","db":"connected","cachedBoards":0}
```

**Start:** `cd backend && npm run dev` (runs migrations on boot, starts on :3001)

## What's Built

```
backend/src/
├── app.ts                  # Fastify entry: CORS → migrations → routes → listen
├── config.ts               # 7 env vars (DATABASE_URL required, rest have defaults)
├── db/
│   ├── pool.ts             # postgres npm, 10 connections, camelCase transform
│   └── migrate.ts          # Idempotent migrations: matches, moves, player_stats
├── routes/
│   ├── health.ts           # GET /api/health
│   ├── matches.ts          # GET /api/matches, /:id, /:id/history
│   ├── players.ts          # GET /api/players/:pubkey/stats, /matches
│   ├── leaderboard.ts      # GET /api/leaderboard?sortBy=wins|winRate|totalGames
│   └── sync.ts             # POST /api/sync/match-created, player-joined, move-made,
│                           #      game-ended, payout
└── services/
    └── boardCache.ts       # In-memory FEN engine: initMatch, applyMove, getFen,
                            # rebuildBoardState (from DB replay on cache miss)
```

**Frontend additions:**
```
frontend/lib/api.ts         # Typed fetch wrapper — all read + sync endpoints
frontend/store/lobby.ts     # Wired to real API (was MOCK_MATCHES)
```

## Database (Supabase)

| Table | Purpose | Key indexes |
|-------|---------|-------------|
| `matches` | Every match created on-chain | status, white_player, black_player |
| `moves` | Every move with FEN after move | (match_id, move_number), event_signature UNIQUE |
| `player_stats` | Aggregated W/L/D, streaks, amounts | wins DESC, player_pubkey PK |

All tables registered with `supabase_realtime` publication (ready for Realtime subscriptions).

## API Reference

### Reads (frontend → backend)

| Endpoint | Query params | Returns |
|----------|-------------|---------|
| `GET /api/matches` | `status`, `player`, `page`, `limit` | Paginated match list with FEN |
| `GET /api/matches/:id` | — | Full match detail + live FEN from board cache |
| `GET /api/matches/:id/history` | — | All moves with FEN after each move |
| `GET /api/players/:pubkey/stats` | — | Wins/losses/draws, streaks, amounts wagered/won |
| `GET /api/players/:pubkey/matches` | `page`, `limit`, `status` | Paginated match history |
| `GET /api/leaderboard` | `sortBy`, `limit` | Ranked player list |
| `GET /api/health` | — | DB status + cache info |

### Sync (frontend → backend — called after on-chain tx confirms)

| Endpoint | When to call | Key payload fields |
|----------|-------------|-------------------|
| `POST /api/sync/match-created` | After `initializeMatch` confirms | matchId, creator, betAmount, signature, slot |
| `POST /api/sync/player-joined` | After `joinMatch` confirms | matchId, playerTwo, betAmountPerPlayer, signature, slot |
| `POST /api/sync/move-made` | After `makeMove` confirms | matchId, player, fromRow/Col, toRow/Col, promotionPiece, isCheck/Checkmate/Stalemate, signature, slot |
| `POST /api/sync/game-ended` | After game-end event fires | matchId, status (camelCase), winner, reason, signature, slot |
| `POST /api/sync/payout` | After `processMatchSettlement` confirms | matchId, signature, slot |

All sync endpoints are idempotent (`ON CONFLICT DO NOTHING` on event_signature).

## FEN Engine (boardCache.ts)

**How it works:**
1. `MatchCreated` event → `initMatch(matchId)` creates starting position in memory → returns starting FEN
2. `MoveMade` event → `applyMove(matchId, {from,to,promotion,color})` replays exact move, updates castling rights, en passant, halfmove/fullmove clocks → returns new FEN
3. On cache miss (server restart): `rebuildBoardState()` replays all moves from DB, then applies new move
4. `GameEnded` event → `removeMatch(matchId)` frees memory

**Verified correct:** Tested e2e4 → produces `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1` (correct turn, en passant target, halfmove clock).

**Limitations (ponytail — add when needed):**
- Single-process in-memory cache. Server restart loses cache (rebuilds from DB).
- Only standard starting position. Chess960 not supported.
- SAN move notation not computed (coordinates only). Add `toSan()` from SDK when PGN export needed.

## What's NOT yet wired

### Frontend → Backend sync

The sync endpoints exist and are tested, but the frontend doesn't call them yet. After every on-chain tx confirms, the frontend MUST call the corresponding sync endpoint:

```typescript
// In frontend/lib/magicblock.ts submitMoveTx() — after signature confirms:
import { api } from '@/lib/api';

// After successful move:
await api.syncMoveMade({
  matchId,
  player: wallet.publicKey.toBase58(),
  playerColor: currentTurn, // 'white' | 'black'
  algebraicMove: `${from}${to}`,  // e.g. 'e2e4'
  fromRow, fromCol, toRow, toCol,
  promotionPiece: promotion || null,
  isCheck, isCheckmate, isStalemate,
  signature,
  slot,
});
```

**Integration points (in order of priority):**

| # | File | What to do |
|---|------|------------|
| 1 | `frontend/lib/magicblock.ts` | Call `api.syncMoveMade()` after move tx confirms |
| 2 | `frontend/hooks/useMoveSubmit.ts` | Call sync endpoints after each tx lifecycle step |
| 3 | `frontend/app/arena/page.tsx` | Remove MOCK_MATCHES, use `api.listMatches()` + `refreshLobbyAtom` |
| 4 | `frontend/app/play/[matchId]/page.tsx` | Call `api.syncMatchCreated()` on create, `api.syncGameEnded()` on end |
| 5 | `frontend/app/profile/page.tsx` | Use `api.getPlayerStats()` + `api.getPlayerMatches()` |
| 6 | `frontend/store/lobby.ts` | Already wired — `refreshLobbyAtom` calls `api.listMatches()` |

### Supabase Realtime

Tables are registered with `supabase_realtime`. Frontend can subscribe to live DB changes:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Listen for new moves on a specific match
supabase
  .channel('moves')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'moves', filter: `match_id=eq.${matchId}` },
    (payload) => { /* update board */ }
  )
  .subscribe();
```

This is optional — the SDK `useMatchEvents` already polls chain. Realtime adds cross-device sync (spectator sees moves instantly).

## Environment

```bash
# backend/.env (created, working)
DATABASE_URL=postgresql://postgres:***@db.kdsujmdubweeofjyztos.supabase.co:5432/postgres
SUPABASE_URL=https://kdsujmdubweeofjyztos.supabase.co
SUPABASE_ANON_KEY=sb_publishable_GCIpWDELwLbKfDuP-mL_gA_LeQlXNlq
RPC_ENDPOINT=https://api.devnet.solana.com
PROGRAM_ID=FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
PORT=3001
CORS_ORIGIN=http://localhost:3000

# frontend/.env.local (updated with backend + supabase)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://kdsujmdubweeofjyztos.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_GCIpWDELwLbKfDuP-mL_gA_LeQlXNlq
```

## What was deliberately skipped

| Item | Why skipped | When to add |
|------|------------|-------------|
| Redis | Supabase Realtime for pub/sub | High-traffic prod (>100 concurrent games) |
| Helius webhooks | Client-driven sync simpler | Production reliability (webhooks catch missed events) |
| Crank worker | Manual `claimTimeoutWin` works | Auto-timeout UX for idle players |
| ELO ratings | Schema ready, not populated | When rating system launches |
| PGN export | Move history has all data | Add endpoint when PGN download button added to UI |
| Chess-utils shared package | Inlined FEN (50 lines) in boardCache | When SDK subpath exports configured |
| Service role key | Direct DB connection bypasses PostgREST | If switching to Supabase client for server-side queries |

## Cloudflare Pages Build Issue (known)

Frontend build on Cloudflare fails because `"@magic-chess/sdk": "file:../sdk"` resolves the symlink but the SDK's peerDependencies (`@solana/web3.js`) aren't installed in Cloudflare's build context. Cloudflare builds from `./frontend` as root, so `../sdk/node_modules` doesn't exist.

**Fix options being evaluated by parallel agent.** Likely solution: either make `@solana/web3.js` a regular dependency of the SDK, or configure Cloudflare to install from repo root with workspace protocol.

## Related Docs

- `docs/docs/backend-design.md` — Original comprehensive design (this implementation is the MVP subset)
- `docs/docs/spec.md` — Full project spec
- `docs/docs/current-state.md` — Frontend state (mock data, needs wiring)
- `docs/docs/architecture.md` — System architecture
- `docs/planning/frontend-anchor-integration-plan.md` — Phase 7 covers backend wiring
- `backend/README.md` — Backend quickstart
