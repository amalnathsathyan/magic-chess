# Magic Chess — Frontend ↔ Anchor Full Integration Plan

Date: 2026-08-08 | Based on: 7-agent fan-out + master audit report + spec

---

## Overview

Goal: Ship a complete chess dApp where users sign in with Privy, create/join gasless chess games via MagicBlock ER, play with real on-chain moves, spectate live games, and wager on prediction pools — all with professional UX.

**Current grade: C+ → Target: A-**

---

## Phase 0: Critical Anchor Program Fixes (P0)

Must fix before frontend can function correctly.

### 0.1 Fix castling rights on rook capture
- **File:** `magic-chess-program/programs/magic_chess/src/utils/chess_logic.rs:439-455`
- **Bug:** Castling right stays true when rook captured on starting square
- **Fix:** In `validate_and_apply_move`, check captured piece position; revoke corresponding right
- **Effort:** Small (1 file, ~15 lines)

### 0.2 Fix prediction platform fee transfer
- **File:** `magic-chess-program/programs/magic_chess/src/instructions/claim_prediction_winnings.rs:104-114`
- **Bug:** Fee calculated but never transferred to platform ATA
- **Fix:** Add `platform_fee_ata` account to `ClaimPredictionWinnings` context; do token transfer
- **Effort:** Small (1 file, ~20 lines)

### 0.3 SDK: Fix abortMatch (un-block frontend)
- **File:** `sdk/src/client.ts`
- **Bug:** Throws "not yet implemented" — instruction exists and works on-chain
- **Fix:** Implement `abortMatch(matchId, playerTokenAccount)` calling `program.methods.abortMatch()`
- **Effort:** Small (1 file, ~30 lines)

### 0.4 SDK: Add setSessionKey + closeMatch methods
- **File:** `sdk/src/client.ts`
- **Missing:** `setSessionKey(matchId, sessionPubkey, expiresAt)` and `closeMatch(matchId)`
- **Fix:** Add both methods wrapping respective instructions
- **Effort:** Small (1 file, ~40 lines)

### 0.5 Fix IDL — replace hardcoded with generated
- **File:** `frontend/components/shared/SolanaProgramProvider.tsx`
- **Bug:** Hardcoded IDL missing `prediction_enabled`, wrong `makeMove` arg shape
- **Fix:** Import from `sdk/src/idl/magic_chess.ts` (generated from program)
- **Effort:** Small (1 file, ~10 lines changed)

### 0.6 Frontend: Wire resign to on-chain
- **File:** `frontend/app/play/[matchId]/page.tsx`, `frontend/components/chess/BoardControls.tsx`
- **Bug:** Resign sets local state only, never calls `client.resign()`
- **Fix:** Call `client.resign(matchId)` in `onResign` handler
- **Effort:** Small (2 files, ~5 lines)

### 0.7 Frontend: Fix CreateMatchForm dummy pubkeys
- **File:** `frontend/components/lobby/CreateMatchForm.tsx`
- **Bug:** `platformFeeWallet`, `bettingTokenMint`, `playerTokenAccount` = `111...111`
- **Fix:** Use real `bettingTokenMint` (from env or user's ATA), derive platform fee wallet, get player's ATA
- **Effort:** Medium (need SPL token account derivation)

---

## Phase 1: Privy Auth + Gas Sponsorship

### 1.1 Fix Solana-only wallet connection (no Ethereum popups)
- **Current:** `Providers.tsx` login methods: `["email", "google", "wallet", "discord"]`
- **Problem:** Without explicit Solana config, `walletChainType` defaults to EVM. Phantom/Backpack show Ethereum wallets, not Solana. Must explicitly configure Solana connectors.
- **Root cause:** Privy requires `externalWallets.solana.connectors` — without it, Solana wallet connectors don't initialize and wallets show EVM addresses.
- **Fix in `Providers.tsx`:**
  ```tsx
  import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
  import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

  const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

  <PrivyProvider
    config={{
      loginMethods: ['email', 'google', 'discord'],  // remove 'wallet' — Solana wallets come via externalWallets
      appearance: {
        walletChainType: 'solana-only',  // CRITICAL: prevents EVM wallet detection
        walletList: ['phantom', 'solflare', 'backpack', 'detected_solana_wallets', 'wallet_connect_qr_solana'],
      },
      externalWallets: {
        solana: { connectors: solanaConnectors },  // CRITICAL: enables Solana wallet detection
      },
      solana: {  // Configure RPC endpoints for each network
        rpcs: {
          'solana:devnet': {
            rpc: createSolanaRpc(process.env.NEXT_PUBLIC_RPC_ENDPOINT!),
            rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.devnet.solana.com'),
          },
          'solana:mainnet': {
            rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
            rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
          },
        },
      },
    }}
  >
  ```
- **New dependency:** `@solana/kit` (already in package.json)
- **Effort:** Medium (1 file, ~30 lines changed + testing with Phantom/Backpack)

### 1.2 Configure social logins properly
- **Google:** Already in login methods array. Verify redirect URI in Privy dashboard
- **Discord:** Already in login methods. Verify OAuth2 credentials
- **Twitter/X:** Not configured. Add if desired
- **Effort:** Small (config only)

### 1.3 Enable gas sponsorship via Privy
- **File:** `frontend/components/shared/Providers.tsx`
- **Mechanism:** Privy fee payer pattern (server-side signing). NOT `fundedWallet` config.
- **Flow for each sponsored transaction:**
  1. Frontend builds a `VersionedTransaction` with a server-controlled fee payer pubkey
  2. User signs via Privy embedded wallet (`embeddedWallet.signMessage()` or `useSignTransaction()`)
  3. Frontend POSTs base64-serialized tx to backend `/api/sponsor` route
  4. Backend validates (whitelisted program IDs, rate limits, no SOL drain from fee payer), signs with fee payer keypair, broadcasts via `connection.sendTransaction()`
- **Server-side:** `PRIVY_APP_SECRET` in `.env.local` + fee payer keypair (funded with SOL, stored in env vars or secrets manager)
- **Security (critical):**
  - Rent refunds from ATA closures go to account owner, not fee payer — attackers can drain via repeated open/close ATA cycles
  - Must validate: no SystemProgram transfer from fee payer, whitelist program IDs (`FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`), set max sponsorship amount per tx
  - Rate limit per user/IP
- **New backend route needed:** `POST /api/sponsor` — validates + signs + broadcasts
- **Ponytail:** For MVP, only sponsor `initializeMatch` and `joinMatch`. Delegation + session key = user pays (costs ~$0.06). Or skip sponsorship entirely — ER gameplay is already gasless via session keys.
- **Effort:** Large (new backend route, fee payer key management, security validation)

### 1.4 Handle two wallet scenarios
| Scenario | Gas paid by | Session keys |
|----------|------------|--------------|
| Privy embedded wallet (email/Google login) | Privy gas sponsorship | Yes — ER gasless |
| External Solana wallet (Phantom/Backpack) | User's wallet (they sign) | Yes — session key = ER gasless, but user pays delegation gas |
| Unauthenticated | N/A — demo mode only | No |

- **Decision:** For external wallets, ask user confirmation before L1 transactions (delegation costs ~$0.06)
- **UX:** Show "This transaction costs ~$0.0001 SOL" or "Sponsored by Magic Chess" badge
- **Effort:** Small (UI overlay)

### 1.5 Auth state sync with game flow
- Already done: `JotaiPrivySync.tsx` syncs Privy → Jotai atoms
- Need: After login, redirect to intended page (e.g., shared game link)
- **Fix:** Store `redirectAfterLogin` in URL search params or localStorage
- **Effort:** Small

---

## Phase 2: Game Creation Flow

### 2.1 Time buffer system: "Game starts in X"
- **Current:** Match starts immediately when Player 2 joins
- **Need:** Player 1 sets a start time: 2min / 5min / 10min / custom
- **Implementation:**
  - Add `scheduled_start: i64` (Unix timestamp) to `ChessMatch` OR
  - Simpler ponytail: Frontend creates match with `move_timeout_duration` but game doesn't show as "joinable" until `scheduled_start` is near
  - **Lazy approach:** Add `start_buffer` field in match metadata (stored off-chain in backend). Match created on-chain immediately. Backend filters out matches whose `scheduled_start > now` from lobby. Player 2 can still join via direct link but gets "Match starts in X" countdown.
- **Frontend:** `CreateMatchForm` dropdown: "Start now" | "In 2 min" | "In 5 min" | "In 10 min" | Custom
- **Effort:** Medium

### 2.2 Game creation → delegation flow
- **Current state:** CreateMatchForm calls `client.createMatch()` but delegation never triggered
- **Correct flow:**
  1. User fills form (wager, time control, start buffer, prediction toggle)
  2. User clicks "Create Match"
  3. **If Privy embedded wallet:** Sign `initializeMatch` (sponsored), then sign `delegateMatch` (sponsored)
  4. **If external wallet:** Sign `initializeMatch` (user pays), confirm delegation, sign `delegateMatch` (user pays)
  5. Show transaction progress: "Creating match..." → "Funding escrow..." → "Delegating to ER..." → "Ready!"
  6. On success, navigate to `/play/[matchId]?created=true`
- **Effort:** Medium (wire CreateMatchForm → SDK → tx status → navigation)

### 2.3 Session key generation + persistence
- **File:** New: `frontend/lib/sessionKeys.ts`
- **Flow:**
  1. On first game creation (or login), generate a session Keypair
  2. Store in IndexedDB via `idb` (add dependency or use localStorage for MVP)
  3. After `delegateMatch` confirms, call `setSessionKey(sessionKey.publicKey, expiresAt)`
  4. Expiry: 7 days from now (max `MAX_SESSION_KEY_TTL`)
  5. On game end / disconnect, call `revokeSessionKey`
- **UI:** Show "Session key active" badge in PlayerCard with expiry
- **Effort:** Medium

### 2.4 Match created confirmation page
- **Show:** "Match Created! Share this link" with copy button
- **URL:** `https://magicchess.xyz/play/{matchId}`
- **QR code:** For mobile sharing (add `qrcode` dependency or use API)
- **Effort:** Small

---

## Phase 3: Game Join Flow

### 3.1 Shared link detection
- **When:** User visits `/play/{matchId}` without auth
- **Show:** "Join this chess match" overlay with:
  - Match details: wager, time control, player 1 address (shortened)
  - "Sign in to Join" button → triggers Privy login
  - After login: auto-redirect back to `/play/{matchId}`
- **Effort:** Small

### 3.2 Join match transaction flow
- **Current:** `handleJoinMatch` in play page exists but untested with real SDK
- **Flow:**
  1. User clicks "Join Match"
  2. Verify match status = `WaitingForOpponent`
  3. Verify user != Player 1
  4. Sign `joinMatch` transaction (sponsored if Privy wallet, user pays if external)
  5. Transfer matching bet to escrow
  6. On success: navigate to game view
- **Auto-start:** `joinMatch` sets `game_status = Active` on-chain. Game starts immediately.
- **Effort:** Small (wire existing code)

### 3.3 Bet amount validation
- **On-chain:** `join_match` validates `bet_amount_player_two == bet_amount_player_one`
- **Frontend:** Show bet amount, warn if user has insufficient balance
- **Effort:** Small

---

## Phase 4: Gameplay Integration

### 4.1 Wire real move submission
- **File:** `frontend/app/play/[matchId]/page.tsx`
- **Current:** Lines 133-135 and 172-174 are commented out (`// e.g. client.makeMove(...)`)
- **Replace with:**
  ```typescript
  const sig = await submitMoveTx(client, matchId, fromSquare, toSquare, promotion);
  // Sync to backend
  await api.syncMoveMade({...});
  ```
- **useMagicBlock hook:** Already has `submitMove` with ER/base routing — use it
- **Effort:** Small (uncomment + wire)

### 4.2 Fix clock model — align frontend to on-chain
- **Current mismatch:**
  - Frontend: Standard chess clock (total time per player with increment)
  - On-chain: Per-move timeout (`last_move_timestamp + move_timeout_duration`)
- **Decision for MVP:** Use per-move countdown clock
  - Each move: timer resets to `move_timeout_duration`
  - Display: "Time per move: 5:00" counting down
  - If time reaches 0, opponent can call `claimTimeoutWin`
  - Do NOT show standard chess clock (misleading)
- **Future:** Add real chess clock fields to ChessMatch (Phase 3)
- **Effort:** Medium (rewrite `useChessClock` for per-move model)

### 4.3 Board state sync from on-chain
- **Source of truth:** On-chain `ChessMatch.board` array
- **Flow:**
  1. On page load: fetch match via `client.getMatch(matchId)` → parse `board` via `boardToFen()` → set initial FEN
  2. On each move: if event received from `useMatchEvents`, update FEN from event's `boardFen`
  3. Fallback: poll `getMatch()` every 5 seconds (only for non-delegated matches)
- **For ER matches:** `useMatchEvents` won't work on ER RPC. Poll `getMatch()` against ER connection every 2 seconds. Or use MagicBlock streaming (Phase 4.5).
- **Effort:** Medium

### 4.4 Optimistic move with rollback
- **Current:** Move applied to local chess.js immediately. On-chain tx may fail.
- **Fix:**
  1. Save `fenBeforeMove` before applying
  2. Apply move optimistically
  3. Submit on-chain
  4. If tx fails: restore `fenBeforeMove`, show error toast
  5. If tx succeeds: keep optimistic state (already correct)
- **Effort:** Small

### 4.5 Real-time board sync via MagicBlock ER WebSocket
- **Finding:** MagicBlock ER supports **standard Solana WebSocket subscriptions**. No custom streaming API needed.
- **Mechanism:** `connection.onAccountChange(pda, callback)` pointed at ER's `wss://` endpoint
- **Latency:** ~50ms per update (ER confirmations are fast)
- **Implementation:**
  ```typescript
  // 1. Get ER FQDN from router
  const status = await getDelegationStatus(chessMatchPda);
  // status.fqdn = "https://devnet-as.magicblock.app/"

  // 2. Create connection with WebSocket endpoint
  const erWsUrl = status.fqdn.replace('https://', 'wss://');
  const erConnection = new Connection(status.fqdn, { wsEndpoint: erWsUrl });

  // 3. Subscribe to account changes on the ER
  const subId = erConnection.onAccountChange(
    chessMatchPda,
    (accountInfo) => {
      const match = program.coder.accounts.decode('ChessMatch', accountInfo.data);
      const fen = boardToFen(match.board, match.currentTurn, ...);
      setFen(fen);
      setTurn(match.currentTurn);
    },
    'processed'  // ~50ms latency
  );
  ```
- **Existing subscription methods available on ER WS:**
  | Method | Use |
  |--------|-----|
  | `accountSubscribe` | Real-time board state, turn, status changes |
  | `logsSubscribe` | Catch MoveMadeEvent, GameEndedEvent |
  | `programSubscribe` | All match account changes for arena |
  | `signatureSubscribe` | Confirm move submission |
- **gRPC streaming:** Proposed (magicblock-validator#882) but NOT available yet. WebSocket is the primary mechanism.
- **Router WS** (`wss://devnet-router.magicblock.app`) can route subscriptions, but direct ER WS has lower latency.
- **For non-delegated matches:** Poll `getAccountInfo()` every 5 seconds. Or use backend as relay (Supabase Realtime).
- **Effort:** Small (1 new hook: `useErAccountSubscription`, ~40 lines)

### 4.6 Transaction notification banner
- **Design:** Small toast/banner at top-right showing:
  ```
  ┌─────────────────────────────────────────────┐
  │ ♟ e2-e4  ✓ Confirmed                        │
  │ Tx: 4xYk...9aF1  |  Slot: 123,456          │
  │ FEN: rnbqkbnr/pppppppp/8/8/4P3/8/...       │
  └─────────────────────────────────────────────┘
  ```
- **Use:** `sonner` toast (already installed) + `TransactionStatus` component
- **Data:** From `MoveMadeEvent` — `algebraicMove`, `boardFen`, tx signature
- **Click:** Opens Solana explorer for tx
- **Effort:** Small (wire existing `useMoveSubmit` + toast)

---

## Phase 5: Homepage + Lobby

### 5.1 Replace MOCK_MATCHES with real data
- **File:** `frontend/app/arena/page.tsx`
- **Current:** Has both `MOCK_MATCHES` array and `useMatches()` from SDK
- **Fix:** Remove `MOCK_MATCHES`. Use `useMatches()` exclusively. Fallback: show empty state "No open matches. Create one!"
- **Also:** Use `refreshLobbyAtom` from lobby store (wired to backend API)
- **Data sources to merge:**
  - SDK `useMatches()` → on-chain matches (WaitingForOpponent)
  - Backend `api.listMatches()` → indexed matches (all statuses, faster, includes board FEN)
  - **Strategy:** Prefer backend API for listing (faster, includes boardFEN). Use SDK for write operations.
- **Effort:** Medium

### 5.2 Lobby cards with live data
- **Current:** `MatchCard.tsx` renders but data is mock
- **Real data fields to display:**
  - Match ID (shortened)
  - Status badge (Open/Live/Completed) with color
  - White player (shortened address)
  - Wager amount (SOL)
  - Time control
  - "Created X ago" timestamp
  - "Gasless ER" badge (if delegated)
  - Action: "Join" (open) / "Spectate" (live) / "View" (completed)
- **Effort:** Small

### 5.3 Logged-in user dashboard
- **New page/component:** Show user's active games, match history, stats
- **Current:** Profile page has mock data (`/profile`)
- **Wire to:** `usePlayerMatches(userPubkey)` from SDK + `api.getPlayerStats(pubkey)` from backend
- **Effort:** Small (wire existing profile page)

### 5.4 Filter + Search functionality
- **Current:** Filter UI exists in arena page, `filteredMatchesAtom` logic in lobby store
- **Wire:** Arena page reads `filteredMatchesAtom` instead of direct `useMatches()`
- **Effort:** Small

---

## Phase 6: Spectate + Prediction Market

### 6.1 Spectate page — real data
- **File:** `frontend/app/play/[matchId]/spectate/page.tsx`
- **Current:** All mock data, chess.js local only
- **Wire:**
  1. Fetch match via `client.getMatch(matchId)` or backend `api.getMatch(matchId)`
  2. Parse board → FEN via `boardToFen()`
  3. Display board (draggable=false, read-only)
  4. Show live clocks (per-move countdown)
  5. Subscribe to `useMatchEvents` for real-time updates
  6. Show "N watching" (backend maintains watcher count)
- **Auth:** Allow unauthenticated viewing. "Sign in to place prediction bets" CTA
- **Effort:** Medium

### 6.2 Prediction pool UI — Polymarket-style bars
- **Current:** `PredictionBars.tsx` component built but uses mock pool data
- **Wire:** `usePredictionPool(matchId)` hook → fetches real `PredictionPool` account
- **Display:**
  ```
  White wins  ████████████████████  1,500 CHESS  60%
  Draw        ██████                  450 CHESS  18%
  Black wins  ██████████              550 CHESS  22%
  ```
- **Bet modal:** Click any bar → opens bet placement modal
  - Select outcome (White/Draw/Black)
  - Enter amount
  - Confirm transaction (sponsored if Privy wallet)
- **"My Bets" section:** Show user's active bets in this pool
- **Effort:** Medium

### 6.3 Prediction pool — draw outcome
- **Current bug:** No Draw button in prediction panel. On-chain supports `outcome=2` (Draw).
- **Fix:** Add Draw as third option in prediction bars + bet modal
- **Effort:** Small

### 6.4 Prediction betting transaction flow
- **Flow:**
  1. Check `prediction_enabled` on match
  2. If pool not initialized: call `client.initializePredictionPool(matchId)`
  3. Call `client.placePredictionBet(matchId, outcome, amount, bettorATA)`
  4. Show confirmation toast
- **Restrictions:**
  - Cannot bet on own match
  - Bets locked once game = Active (can't change)
  - Cancel allowed if match aborted or never started
- **Effort:** Medium

---

## Phase 7: Backend Integration

### 7.1 Wire sync endpoints from frontend
- **Current:** `api.sync*` endpoints defined but never called from frontend
- **Call on each on-chain event:**
  - After `createMatch` confirms → `api.syncMatchCreated({...})`
  - After `joinMatch` confirms → `api.syncPlayerJoined({...})`
  - After `makeMove` confirms → `api.syncMoveMade({...})`
  - After game ends → `api.syncGameEnded({...})`
  - After settlement → `api.syncPayout({...})`
- **Create a `useSyncBackend` hook** that wraps these calls with error handling (fire-and-forget, don't block UX)
- **Effort:** Small

### 7.2 Supabase Realtime — cross-device live updates
- **Current:** Backend has Supabase Realtime enabled on `matches` and `moves` tables
- **Frontend subscription:**
  ```typescript
  import { createClient } from '@supabase/supabase-js';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabase.channel('match-{matchId}')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'moves', filter: `match_id=eq.${matchId}` },
      (payload) => { /* update board from payload.new.fen_after_move */ }
    )
    .subscribe()
  ```
- **Use case:** Spectators get move updates without direct Solana connection. Works cross-device.
- **Note:** For players IN the game, use ER WebSocket directly (Phase 4.5) — lower latency. Supabase Realtime = spectator + arena feed.
- **Dependency:** `@supabase/supabase-js` (add to frontend)
- **Effort:** Medium

### 7.3 Backend — add on-chain verification
- **Current:** Backend sync endpoints trust client data blindly
- **Add:** Verify transaction signature against Solana RPC before storing
  ```typescript
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
  if (!tx) throw new Error('Transaction not found');
  // Parse logs to verify event data matches
  ```
- **Effort:** Medium

### 7.4 Backend — MagicBlock ER polling worker
- **Need:** Continuous board state for ER-delegated matches
- **Add:** `src/workers/erPoller.ts` — polls ER connection every 5 seconds for active delegated matches
- **Updates:** Board cache + pushes to Supabase Realtime
- **Effort:** Medium

---

## Phase 8: Polish + Deployment

### 8.1 Error mapping — 51 on-chain errors → user-friendly messages
- **File:** New: `frontend/lib/errors.ts`
- **Map:**
  ```
  ChessError.UnauthorizedSigner → "You can't make a move for your opponent"
  ChessError.GameNotActive → "This game hasn't started yet"
  ChessError.InvalidMove → "That move isn't valid. Try again."
  ChessError.InsufficientBalance → "Not enough tokens to place this bet"
  ... (40+ more)
  ```
- **Use:** In `useMoveSubmit` and all transaction calls, catch errors and map before showing toast
- **Effort:** Medium (one-time mapping)

### 8.2 Loading skeletons + empty states
- **Every page needs:** Skeleton while loading, empty state when no data, error state with retry
- **Priority pages:** Arena (match list), Profile (stats), Play (board loading)
- **Effort:** Medium (design work)

### 8.3 Mobile responsiveness
- **Chess board:** `react-chessboard` handles touch. Test drag-and-drop on mobile.
- **Layout:** Arena sidebar → bottom sheet on mobile. Play page: single column on mobile (board on top, move list below)
- **Effort:** Medium

### 8.4 PWA — offline + install
- **Current:** PWA scaffolded but not active
- **Add:** Service worker, manifest.json with chess icons, offline "No connection" state
- **Effort:** Small

### 8.5 CI pipeline
- **GitHub Actions:**
  ```yaml
  - cargo test -p magic_chess (unit + litesvm)
  - cargo test --features integration-tests -p magic_chess --test cu_benchmarks
  - cd frontend && npm run typecheck && npm run lint
  - cd sdk && npx tsc --noEmit
  ```
- **Effort:** Small

---

## Implementation Order

```
Phase 0 (P0 fixes):        Day 1-2    | 7 small fixes — unblock frontend
Phase 1 (Privy auth):      Day 2-3    | Login flow complete, gas sponsorship
Phase 2 (Create flow):     Day 3-5    | Game creation with time buffer + delegation
Phase 3 (Join flow):       Day 5-6    | Shared link → login → join
Phase 4 (Gameplay):        Day 6-10   | Real moves, clock, board sync, tx banners
Phase 5 (Homepage/Lobby):  Day 10-12  | Real data, cards, filtering
Phase 6 (Spectate/Predict): Day 12-14 | Spectator view, prediction betting
Phase 7 (Backend):         Day 14-16  | Sync, Realtime, ER polling
Phase 8 (Polish):          Day 16-19  | Errors, skeletons, mobile, PWA, CI
                            Day 20     | Final testing + deploy
```

**Total: 20 days with 1-2 devs**

---

## Files That Change (Complete Manifest)

### Anchor Program (Rust) — 2 files
- `magic-chess-program/programs/magic_chess/src/utils/chess_logic.rs` — castling fix
- `magic-chess-program/programs/magic_chess/src/instructions/claim_prediction_winnings.rs` — platform fee transfer

### SDK — 3 files
- `sdk/src/client.ts` — abortMatch, setSessionKey, closeMatch methods
- `sdk/src/types.ts` — add missing ChessMatch fields, fix enum deserialization
- `sdk/src/react/index.ts` — add useMatchEvents for all event types

### Frontend — ~25 files
**New files:**
- `frontend/lib/errors.ts` — error mapping
- `frontend/lib/sessionKeys.ts` — session key generation + IndexedDB
- `frontend/hooks/useSyncBackend.ts` — sync hook
- `frontend/hooks/useSupabaseRealtime.ts` — Supabase subscription
- `frontend/components/chess/JoinMatchOverlay.tsx` — join CTA for shared links

**Modified files:**
- `frontend/components/shared/SolanaProgramProvider.tsx` — use generated IDL
- `frontend/components/shared/Providers.tsx` — fix Solana wallet config, gas sponsorship
- `frontend/components/shared/WalletButton.tsx` — show sponsorship badge
- `frontend/components/lobby/CreateMatchForm.tsx` — real pubkeys, time buffer, flow
- `frontend/components/lobby/MatchCard.tsx` — real data wiring
- `frontend/components/chess/BoardControls.tsx` — wire resign, flip, draw
- `frontend/components/chess/GameStatus.tsx` — wire "Claim Winnings" CTA
- `frontend/components/chess/PredictionBars.tsx` — real pool data, draw option
- `frontend/components/chess/PlayerCard.tsx` — session key badge, real player data
- `frontend/app/arena/page.tsx` — remove MOCK_MATCHES, use real data
- `frontend/app/play/[matchId]/page.tsx` — real moves, clock, board sync, rollback, join overlay
- `frontend/app/play/[matchId]/spectate/page.tsx` — real data, prediction wagering
- `frontend/app/profile/page.tsx` — real stats + match history
- `frontend/hooks/useChessClock.ts` — per-move countdown model
- `frontend/hooks/useMoveSubmit.ts` — error mapping, backend sync
- `frontend/store/lobby.ts` — wire to arena page
- `frontend/lib/magicblock.ts` — implement session creation

### Backend — 4 files
- `backend/src/routes/sync.ts` — add on-chain signature verification
- `backend/src/workers/erPoller.ts` — new: ER state polling worker
- `backend/src/services/boardCache.ts` — multi-process support (Redis or SQLite fallback)
- `backend/src/routes/players.ts` — fix SQL injection in pubkey parameter

---

## Key Design Decisions

1. **Clock model:** Per-move countdown for MVP (matches on-chain). Standard chess clocks = Phase 3.
2. **Data source:** Backend API for reads (fast, includes boardFEN). SDK for writes (on-chain).
3. **Real-time — players:** ER WebSocket `onAccountChange` (~50ms latency). Standard Solana WS.
4. **Real-time — spectators:** Supabase Realtime (Postgres change subscription). No Solana connection needed.
5. **MagicBlock streaming:** No custom API needed. ER exposes full Solana JSON-RPC WebSocket surface at `wss://{er-fqdn}`. `accountSubscribe` for board state, `logsSubscribe` for events.
6. **Session keys:** Generate per-user (not per-match). Store in IndexedDB. 7-day expiry. Per-color on-chain (already fixed).
7. **Game start:** Immediate on Player 2 join. Time buffer = off-chain metadata for lobby filtering.
8. **Auth:** Privy embedded wallets (gas sponsored via fee-payer pattern) + external Solana wallets (user pays gas). `walletChainType: 'solana-only'` with `toSolanaWalletConnectors()` required.
9. **Prediction:** Parimutuel, public aggregates only (no bet amount privacy for MVP).
10. **gRPC:** Not available yet (MagicBlock proposal #882). WebSocket is the primary streaming mechanism.
11. **Gas sponsorship:** Server-side fee payer keypair signs after user signs. Requires backend `/api/sponsor` route with security validation (rate limiting, program whitelisting, SOL drain prevention).

---

## What's Skipped (Ponytail Deferrals)

- **Standard chess clocks** — per-move timeout is simpler. Add real clocks in Phase 3.
- **Draw-by-agreement instruction** — frontend "Offer Draw" is social signal only for MVP.
- **Token dripper (CHESS token)** — use SOL/any SPL for wagering. Token launch later.
- **Fee split treasury vault** — platform fee goes to single dev wallet for now.
- **Helius webhooks** — client-driven sync + ER polling = good enough.
- **ELO ratings** — schema exists in backend, no population logic yet.
- **Kani formal verification** — deferred.
- **PGN export API** — move data stored; formatting is pure frontend function.
- **Mobile app (React Native)** — PWA first.
