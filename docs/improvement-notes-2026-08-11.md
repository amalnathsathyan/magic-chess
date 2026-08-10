# Improvement Notes — 2026-08-11

Live test + code review of `arena-dev.chessmagic.workers.dev` / `magic-chess-dev.onrender.com` / `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` (devnet).

---

## CRITICAL

### 1. Frontend points to dead backend
**File**: `frontend/wrangler.toml:29`
**Symptom**: `NEXT_PUBLIC_API_URL = "https://magic-chess-d84o.onrender.com"` → that backend returns **503**. All API calls (match listing, history, leaderboard, realtime) fail. Sponsor relay (`/api/transactions/sponsor`) fails. Match creation via embedded wallet impossible.
**Fix**: `NEXT_PUBLIC_API_URL = "https://magic-chess-dev.onrender.com"` then rebuild + redeploy.
```
- NEXT_PUBLIC_API_URL = "https://magic-chess-d84o.onrender.com"
+ NEXT_PUBLIC_API_URL = "https://magic-chess-dev.onrender.com"
```
**Impact**: Every API-dependent feature is broken in production. Zero matches can be created with embedded wallets.

### 2. `useMatchRealtime` hook is dead code (380+ lines)
**File**: `frontend/hooks/useMatchRealtime.ts`
**Symptom**: Fully implemented realtime SSE hook (EventSource, session tokens, presence, clock sync, signed challenges) — **never imported anywhere**. Play page uses 3-second polling instead.
**Fix**: Either remove the dead code (YAGNI) or wire it into the play/spectate pages.
**Impact**: 3-second polling means up to 3s delay for opponent moves. Realtime would be instant. Also wastes RPC calls.

---

## HIGH

### 3. No rate limiting on sync endpoints
**File**: `backend/src/routes/sync.ts`
**Symptom**: 6 sync endpoints (`match-created`, `player-joined`, `match-aborted`, `move-made`, `game-ended`, `payout`) protected only by API key. No per-IP or per-key rate limiting. A compromised API key can flood the database.
**Fix**: Add rate limiting middleware to sync routes. Reuse the sliding-window pattern from `realtime.ts`.
**Impact**: DoS risk if API key leaks.

### 4. Unbounded in-memory Map for sponsor rate limiter
**File**: `backend/src/routes/transactions.ts:32`
**Symptom**: `attempts` Map has no size cap, no TTL cleanup sweep. Each unique `userId:walletAddress` adds a permanent entry. A sustained attack with random wallet addresses exhausts memory.
**Fix**: Periodic sweep of expired entries (like `realtime.ts` does at lines 67-84). Cap at 4096 entries.
**Impact**: Memory leak under attack. Server OOM.

### 5. Board cache never pruned by TTL
**File**: `backend/src/services/boardCache.ts`
**Symptom**: Matches removed from in-memory board cache only on `game-ended` or `match-aborted` sync events. If those events never arrive (stuck `WaitingForOpponent`, abandoned match), cache entry persists forever.
**Fix**: Add TTL-based eviction. Remove entries older than 24h on a 5-minute sweep.
**Impact**: Slow memory growth over time. Low priority if match volume is low; becomes critical at scale.

### 6. No React error boundaries
**File**: `frontend/app/error.tsx`
**Symptom**: Bare `<div>500 - Something went wrong</div>`. No retry button, no navigation, no styling. Same for `not-found.tsx` (`<div>404 - Not Found</div>`).
**Fix**: Proper error boundary with: retry button, "Go to Arena" link, error details in dev mode, branded styling.
**Impact**: Any uncaught error in a page component = janky white page. Bad UX for users.

### 7. `timingSafeEqual` imported but unused in API key comparison
**File**: `backend/src/routes/sync.ts:1,21`
**Symptom**: `import { timingSafeEqual } from "node:crypto"` but key comparison uses `!==` (non-constant-time).
**Fix**: Use `timingSafeEqual(Buffer.from(apiKey), Buffer.from(config.apiKey))`.
**Impact**: Timing side-channel on API key. Low practicality but audit red flag.

---

## MEDIUM

### 8. Duplicated components and functions
| Duplicate | Locations |
|-----------|-----------|
| `PlayerRow` component | `app/play/[matchId]/page.tsx:109` + `app/play/[matchId]/spectate/page.tsx` (slight variant) |
| `formatRemaining()` | `app/play/[matchId]/page.tsx:100` + `app/play/[matchId]/spectate/page.tsx` |
| `shortenAddress()` | `lib/chess.ts` + `components/lobby/MatchCard.tsx` |
| Board FEN decoding logic | `app/play/[matchId]/page.tsx:77-86` + `app/play/[matchId]/spectate/page.tsx` |

**Fix**: Extract `PlayerRow` → `components/chess/PlayerRow.tsx`. Extract `formatRemaining` → `lib/time.ts`. Remove duplicate `shortenAddress` in MatchCard, import from `lib/chess`.

### 9. Prediction market UI missing
**File**: `frontend/components/lobby/CreateMatchForm.tsx`
**Symptom**: `predictionEnabled: false` hardcoded. `findPredictionPoolPda` and 5 prediction instructions exist in the on-chain program. SDK exports prediction types. Zero UI.
**Fix**: Add a "Enable prediction betting" toggle in CreateMatchForm. Wire up `predictBet`, `claimPredictionWinnings` instructions.
**Impact**: Major differentiator from other chess apps. Currently invisible.

### 10. Missing UX flows
- **No rematch button**: After game ends, user must navigate to Arena → create new match.
- **No draw offer**: Players can't offer/accept draw. Only automatic draws (stalemate, 50-move, repetition) work on-chain.
- **No in-game chat**: Players can't communicate.
- **Arena page has no auto-refresh**: `useMatches` fetches once. Must navigate away and back to see new matches.

### 11. Settings page has one toggle
**File**: `frontend/app/settings/page.tsx`
Only sound on/off. Missing: display name, theme toggle, notification prefs, wallet management.
**Impact**: Looks unfinished. Settings page exists but does almost nothing.

### 12. `@stripe/stripe-js` dead dependency
**File**: `frontend/package.json`
Never imported anywhere. Remove.
**Impact**: Unnecessary bundle weight.

### 13. Stale env variable names in `.env.local`
`NEXT_PUBLIC_MAGICBLOCK_ROUTER_ENDPOINT`, `NEXT_PUBLIC_MAGICBLOCK_ER_ENDPOINT`, `NEXT_PUBLIC_MAGICBLOCK_TEE_ENDPOINT` — none read by `solana-config.ts`. Only `NEXT_PUBLIC_MAGICBLOCK_ROUTER` (without suffix) is read. Supabase vars also present but unused (frontend API goes through backend, not direct Supabase).
**Fix**: Clean up or verify if these were meant for realtime integration.

### 14. Leaderboard SQL — fragile safety
**File**: `backend/src/routes/leaderboard.ts:34-40`
Switch statement whitelists `sortBy` then passes to `sql.unsafe()`. Currently safe (default = `"wins"`) but fragile. A future dev adding a dynamic sort column could introduce SQL injection.
**Fix**: Use parameterized column reference or add a comment warning.

### 15. Backend sponsor validator silently passes unknown instructions
**File**: `backend/src/services/solanaSponsor.ts:158-219`
`validateMagicChessInstruction` returns void (without throwing) for any Magic Chess program instruction that doesn't match `initialize_match` or `delegate_match`. The calling code then marks `hasAppInstruction = true` — the instruction passes validation without ever being checked.
**Fix**: Add an explicit `throw new SponsorError(...)` for unknown discriminators.
**Impact**: If a new instruction is added to the program, it would be sponsored without any validation policy.

### 16. SDK `all()` fetch doesn't scale
**File**: `sdk/src/client.ts:632,658`
`listJoinableMatches` and `getPlayerMatches` call `this.program.account.chessMatch.all()` which fetches ALL chess match accounts then filters in-memory. 
**Fix**: Use backend API (`/api/matches`) for filtered queries. Reserve `all()` for admin/debugging only.
**Impact**: Works for <100 matches. Breaks at scale.

### 17. MagicBlock polling burns 180+ RPC calls per delegation
**File**: `sdk/src/magicblock.ts:127-190`
`waitForDelegation` polls every 500ms via `resolveAccountRuntime` which makes up to 3 RPC calls per iteration (base + router + ER). Over 30s timeout = up to 180 calls. Same for `waitForUndelegation`.
**Fix**: Increase poll interval to 2s, add exponential backoff. Use router's `getDelegationStatus` (1 call) instead of `resolveAccountRuntime` (3 calls) for the poll loop.
**Impact**: Wastes RPC quota on every delegation/undelegation.

### 18. SolanaProgramProvider recreated on every render
**File**: `frontend/components/shared/SolanaProgramProvider.tsx:269`
`provider` useMemo depends on `signAndSendTransaction` (from Privy) which likely changes reference every render. This cascades: new provider → new program → all children re-render.
**Fix**: Wrap the provider factory in a ref, only update when `anchorWallet` or `connection` actually change. Or memoize `signAndSendTransaction` upstream.
**Impact**: Unnecessary re-renders across the entire app on every state change.

### 19. `MagicSessionProvider` uses `PublicKey.default` instead of `SystemProgram.programId`
**File**: `frontend/components/shared/MagicSessionProvider.tsx:121`
Uses `PublicKey.default` (all-zero pubkey = `111...111`) which happens to equal System Program ID by coincidence. Works but fragile and unclear.
**Fix**: Use `SystemProgram.programId` from `@solana/web3.js`.
**Impact**: No functional bug currently, but reads as a mistake. Will break silently if the constant changes upstream.

### 20. Session liveness RPC check on every move
**File**: `frontend/components/shared/MagicSessionProvider.tsx:61`
Every `ensureSession()` call fetches `getAccountInfo` to verify the session token account exists. For a 30-move game, that's 30 RPC calls just for liveness checks.
**Fix**: Check only on expiry, with periodic on-chain re-validation (every 10 moves or 5 min).
**Impact**: Unnecessary RPC load during gameplay.

---

## LOW

### 15. Profile page empty state edge case
**File**: `frontend/app/profile/page.tsx`
When `stats` fetches but returns an empty player (never played) AND `matches` is empty, the page renders `null` (the final `stats ? (...) : null` guard).
**Fix**: Show "No games played yet. Create your first match!" empty state.

### 16. Spectate page has redundant text
"Read-only spectator mode" header + "Spectator mode is read-only" below board.
**Fix**: Remove the duplicate below-board text.

### 17. Board width doesn't account for sidebar on desktop
**File**: `frontend/app/play/[matchId]/page.tsx:218`
`Math.min(560, Math.max(280, window.innerWidth - 32))` — uses full viewport width. On desktop with 320px sidebar, the board + sidebar can exceed viewport.
**Fix**: Use container query or subtract sidebar width: `Math.min(560, containerWidth - 352)`.

### 18. `useEffect` imported but unused in BoardControls
**File**: `frontend/components/chess/BoardControls.tsx:3`
Remove unused import.

### 19. Scripts in deployed HTML reference `/logo.png` twice
Minor duplicate asset reference. No functional impact but wastes a request in some browsers.

---

## PROGRAM (RUST) ISSUES

### 20. Task ID wrapping to negative in `make_move`
**File**: `magic-chess-program/programs/magic_chess/src/instructions/make_move.rs:223`
`i64::from_le_bytes(...).wrapping_add(...)` can produce a negative `task_id` since `i64` is signed. If the scheduled task system checks `>= 0`, a negative task ID would silently skip cancellation, leaking stale scheduled tasks.
**Fix**: Use `u64` or ensure `wrapping_add` doesn't overflow into negative range.

### 21. `move_timeout_duration * 1000` overflow silently falls back to 0
**File**: `make_move.rs:225`
`checked_mul(1000).unwrap_or(0)` means a large timeout duration that overflows `i64 * 1000` silently creates a 0-timeout → instant loss. Should return an error instead.
**Fix**: Return `Err(ChessError::InvalidTimeoutDuration.into())` on overflow.

### 22. `is_stalemate` field misnamed — set for all draw types
**File**: `make_move.rs:205`
The `MoveMadeEvent.is_stalemate` boolean is set `true` for stalemate, threefold repetition, insufficient material, AND fifty-move rule. Field name is misleading.
**Fix**: Rename to `is_draw` or split into explicit per-reason booleans.

### 23. Delegate on already-delegated match gives `InvalidMatchId`
**File**: `delegate_match.rs:29-33`
Calling `delegate_match` on an already-delegated match fails the owner check (account is owned by delegation program, not the chess program) and returns `InvalidMatchId` — misleading error.
**Fix**: Check `match.is_delegated` first, return a descriptive `AlreadyDelegated` error.

---

## BACKEND SECURITY (from agent audit)

### 24. No CORS restriction on sponsor endpoint
If `CORS_ORIGIN` env var is misconfigured to `*`, the sponsor endpoint accepts cross-origin requests with Authorization header. Currently safe because `CORS_ORIGIN` is configured, but worth documenting.

### 25. Secrets in config object
`feePayerPrivateKey`, `privyJwtVerificationKey`, `apiKey` all loaded into a shared config object. If any logging accidentally dumps `config`, secrets leak.
**Fix**: Never log `config` object. Add custom `toJSON` that redacts secrets.

### 26. No Helmet/CSP headers
No security headers set: X-Content-Type-Options, X-Frame-Options, CSP, HSTS.
**Fix**: Add `@fastify/helmet` or manual headers.

---

## WHAT WORKS WELL

- Backend sponsor relay validation pipeline: **solid**, exhaustive, defense-in-depth. Best part of the codebase.
- `transactionVerifier.ts` BorshCursor + Anchor event decoding: clean, well-typed.
- `SolanaProgramProvider.tsx` AnchorProvider override: clean hack, one method overrides all tx types.
- ChessBoard component: handles all states (check, lastmove, promotion, reduced motion, accessibility labels).
- AuthGate: covers all auth states cleanly.
- `useMoveTransactionNotifications`: dedup + polling fallback + WebSocket subscription — resilient.
- Backend migration system: advisory lock serialization, idempotent sync events, proper transaction wrapping.

---

## SUMMARY

| Severity | Count | Quickest win |
|----------|-------|-------------|
| Critical | 2 | Fix `wrangler.toml` API URL → redeploy (1 line) |
| High | 5 | Add rate limiting to sync routes (~30 lines) |
| Medium | 12 | Extract shared components (~50 lines) |
| Low | 5 | Remove unused import in BoardControls (1 line) |
| Program | 4 | Fix `is_stalemate` field name (API-breaking) |
| Security | 3 | Use `timingSafeEqual` in sync.ts (1 line) |

**Total: 31 items.** Fixing criticals + highs = ~2 hours. All mediums + lows + security = 1-2 days. Program fixes require redeploy (API-breaking).
