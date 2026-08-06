# Magic Chess — Master Audit Report

Date: 2026-08-07 | Agents: 7 (chess logic, new features, frontend, SDK, tests, docs, consolidation)

---

## 1. Chess Engine Correctness (vs FIDE)

**Verdict: Needs work — 1 critical bug, 1 high issue, 3 medium**

### Critical
- **Castling rights not revoked when rook captured on starting square** (`chess_logic.rs:439-455`). If rook on a1/h1/a8/h8 is captured without moving, castling right stays true. If another rook later occupies that corner, illegal castle passes. Fix: check captured piece position in `validate_and_apply_move` and revoke corresponding right.

### High
- **Fifty-move draw returns `MoveResult::Stalemate`** (`chess_logic.rs:203`). Semantic confusion with actual stalemate. `GameEndReason` enum has `FiftyMoveRule` variant but mapping relies on `halfmove_clock` check to disambiguate. Add dedicated `MoveResult::FiftyMoveRule`.

### Medium
- FNV-1a Zobrist hash not cryptographically seeded — deterministic, collision-constructable
- K+B+B (same color) vs lone King not recognized as insufficient material
- Initial position hash never recorded in `position_history` — first occurrence not counted for threefold

### Low
- Ring buffer evicts at 200 entries — threefold detection fails in games >100 full moves
- No 75-move auto-draw rule (FIDE Article 9.6.2)
- `are_no_legal_moves` is O(64^4) worst case — acceptable for ER, note for L1

### ✅ Correct
- All 6 piece movement types, en passant (both colors, expiry, temp board simulation), castling (path clear, square attack checks, rook existence verification), check/checkmate/stalemate via simulation, promotion (4 pieces + default Queen), halfmove/fullmove clocks, FEN generation, board initialization

**Production readiness: `needs-work`** — fix critical castling bug before mainnet.

---

## 2. New Features Audit

**2 critical, 5 high, 6 medium, 6 low**

### Critical

1. **Prediction market platform fees never transferred** (`claim_prediction_winnings.rs:104-114`). Fee is CALCULATED (subtracted from winner_share_pool) but no token transfer sends it to a platform ATA. The `ClaimPredictionWinnings` context has no `platform_fee_ata` account. Fees permanently trapped in vault.

2. **Shared session key = turn hijacking** (`make_move.rs:56-63`). Single `session_signer` field on ChessMatch. Either player can set it. Once set, the session key can move for whichever color has `current_turn`. Malicious player sets session key → moves for opponent on their turn. Fix: per-player session keys or require session key to be bound to specific player.

### High

3. Escrow token account not closable after settlement — dust trapped. `abort_match` closes escrow but `process_match_settlement` does not.
4. Prediction vault dust permanently trapped after all claims (integer division remainder).
5. `delegate_match`/`commit_state`/`undelegate_match` have NO authorization — any signer can call.
6. `claim_timeout_win` schedules undelegation even when match was never delegated.
7. Invalid `platform_fee_wallet` (zero pubkey) makes match permanently un-settleable — funds locked.

### Medium

8. Negative `move_timeout_duration` not validated at init.
9. No max session key expiry — can set to `i64::MAX` for permanent key.
10. `cancel_prediction_bet` post-settlement + empty pool: vault could be drained below refund amount.
11. `PayoutEvent`/`DrawPayoutEvent` defined but never emitted anywhere.
12. State machine gaps: no Active→Aborted, no draw-by-agreement.

### ✅ Correct
- PDA derivations (5 types), double-spend/claim prevention, payout math (fee calc correct), timeout enforcement in `make_move`, session key expiry check, prediction bet cancel refunds correctly, 41 error variants comprehensive

---

## 3. Test Coverage

**281 tests | ~72% coverage | 0 frontend/SDK tests | No CI**

| Harness | Count |
|---------|-------|
| Unit (Rust) | 182 |
| LiteSVM | 43 |
| Mollusk CU | 8 |
| Anchor TS | 12 |
| MagicBlock TS (integration/crank/session) | 18 |
| Frontend | **0** |
| SDK | **0** |

### Critical Gaps (must fix before mainnet)
1. **No frontend tests** — no Jest, Vitest, or Playwright setup
2. **No SDK tests** — client methods, PDA derivation, React hooks all untested
3. **No CI pipeline** — no GitHub Actions for test on push/PR
4. **SPL token edge cases**: wrong owner, wrong mint, insufficient balance, overflow
5. **Re-entrancy**: double-initialize, double-join, resign on concluded game

### High Gaps
6. `claim_timeout_win` integration — 2 LiteSVM tests `#[ignore]`, need MagicBlock scheduler
7. Draw settlement via actual stalemate — tested via account mutation, not full game
8. Expired session key rejection — `#[ignore]` (LiteSVM clock returns 0)
9. Prediction pool: claim before settle, cancel while WaitingForOpponent

### ✅ Covered
- All piece movements, castling, en passant, promotion, check/checkmate/stalemate
- 50-move, threefold, insufficient material (unit)
- All 22 instructions have at least unit coverage; 20/22 have integration
- Payout: 15 settlement scenarios
- CU benchmarks: 8 under 200k CU
- Full ER lifecycle: init→delegate→verify→moves→commit→undelegate
- Token math edge cases: min bet, max fee, fee rounding, unequal bets

---

## 4. Frontend vs Contract Alignment

**4 critical, 5 high, 5 medium, 5 low**

### Critical

1. **Clock mismatch**: Frontend uses standard chess clock (total time per player with increment via `useChessClock`). On-chain uses per-move timeout (`last_move_timestamp + move_timeout_duration`). Fundamentally different time models. Frontend clock is misleading.

2. **Dummy pubkeys in match creation** (`CreateMatchForm.tsx`): `platformFeeWallet`, `bettingTokenMint`, `playerTokenAccount` all set to `11111111111111111111111111111111`. Transaction guaranteed to fail on-chain.

3. **Resign is local-only** (`BoardControls.tsx`): Sets local `resigned` state but never calls `client.resign()`. On-chain match unaffected.

4. **SDK `abortMatch()` throws** claiming "not yet implemented" — instruction exists and works on-chain (`abort_match.rs`, 131 lines).

### High

5. Hardcoded incomplete IDL in `SolanaProgramProvider.tsx` — `initializeMatch` missing `prediction_enabled` arg, `makeMove` uses flat u8 instead of struct, wrong account names.
6. Optimistic move with no rollback — if on-chain tx fails, board stays in optimistic state.
7. `useMatchEvents` only subscribes to `moveMadeEvent`. `gameEndedEvent`, `playerJoinedEvent`, all prediction/payout events unhandled.
8. Session keys non-functional — `useMagicBlock.connect()` sets mock sessionId, never calls `set_session_key`.
9. Timeout claim never called — clock hits 0 and does nothing.

### Medium

10. GameStatus component has `timeout` variant but no code path sets it. Aborted status missing.
11. Prediction market buttons inert — no `placePredictionBet` call, no claim UI.
12. 40 on-chain errors mapped to generic "Failed to submit move" toast.
13. Board state sync: chess.js FEN vs event.boardFen — no single source of truth.
14. Arena: only `WaitingForOpponent` filter works. "Live" and "Completed" = mock data only.

### ✅ Aligned
- Match creation params, draw detection (all 4 types via chess.js), prediction pool data reads, SDK types mirror on-chain enums, FEN generation, promotion dialog, castling/en passant via chess.js

---

## 5. SDK Completeness

**67% implemented | 3 critical missing | Package unpublishable | All files @ts-nocheck**

### Critical Missing Methods
| Method | Instruction | Status |
|--------|-------------|--------|
| `abortMatch` | `abort_match.rs` | Throws "not implemented" — instruction EXISTS |
| `closeMatch` | `close_match.rs` | Missing entirely |
| `setSessionKey` | `set_session_key.rs` | Missing — critical for ER gasless UX |

### High Missing
- `revokeSessionKey`, React mutation hooks (`useCreateMatch`, `useJoinMatch`, `useMakeMove`, etc.), React prediction hooks, React delegation hook

### Type Issues (8 found)
- `ChessMatch` missing 6 MagicBlock fields (`prediction_enabled`, `delegation_uid`, `is_delegated`, `session_signer`, `session_expires_at`, `active_task_id`)
- `MoveResult` missing `InsufficientMaterial` variant
- Enum deserialization mismatch: TS string enums vs Anchor's object-based Borsh — confirmed runtime bug in `determineMoveResult`
- `PredictionPool`/`PredictionBet` camelCase vs snake_case mismatch
- IDL type covers only 6 of 21 instructions (rest suppressed with `@ts-nocheck`)

### Quality
- **Unpublishable**: package.json exports raw `.ts`, no build step, no tsconfig.json, no scripts
- No error type system — throws generic `Error` for all 40+ on-chain error variants
- MagicBlock helpers: devnet-only endpoints, no mainnet
- PDA helpers duplicated inline 4 times for prediction pool
- `useMatchEvents` registers only 1 of 6+ event types

---

## 6. Documentation Health

**6 files to delete | 7 files to update | 4 keep | 1 planning doc**

### Delete (speculative/unimplemented/outdated)
- `backend-design.md` — 2701 lines, zero implementation
- `fee-split.md` — treasury vault, not started
- `token-strategy.md` — CHESS token, not started
- `hackathon.md` — past event, historical artifact
- `frontend-research.md` — library research from planning phase
- `folder-structure.md` — planning doc for now-implemented structure
- `current-state.md` — agent handoff, extract into `frontend.md`

### Update (inaccurate claims)
- `index.md` — rewrite as proper landing page
- `architecture.md` — merge with spec.md, update MagicBlock status, instruction count, test count
- `chess-engine.md` — fix test counts (179→205), row indexing, feature claims
- `magicblock.md` — Task Scheduler disabled, custom session keys, actual delegation flow
- `sdk.md` — verify all method signatures, add MagicBlock helpers
- `deployment.md` — update Anchor version, MagicBlock deploy notes
- `security-audit.md` — current bug status, accurate test counts

### Keep
- `spec.md` — merge into architecture.md or keep as is after updates
- `planning/prediction-market.md` — accurate planning doc for stubbed feature

---

## 7. Priority Actions

### P0 (critical — fix before mainnet)
| # | Action | File | Effort |
|---|--------|------|--------|
| 1 | Fix castling rights not revoked on rook capture | `chess_logic.rs` | Small |
| 2 | Add `platform_fee_ata` transfer in `claim_prediction_winnings` | `claim_prediction_winnings.rs` | Small |
| 3 | Add per-player session keys (or bind key to player) | `chess_match.rs`, `set_session_key.rs`, `make_move.rs` | Medium |
| 4 | Fix `abortMatch` in SDK — implement, don't throw | `sdk/src/client.ts` | Small |
| 5 | Wire resign to on-chain `client.resign()` | `BoardControls.tsx` | Small |
| 6 | Fix match creation dummy pubkeys | `CreateMatchForm.tsx` | Small |
| 7 | Replace hardcoded IDL with generated `magic_chess.json` | `SolanaProgramProvider.tsx` | Small |

### P1 (high — fix for production)
| # | Action | File | Effort |
|---|--------|------|--------|
| 8 | Add authorization to delegate/commit/undelegate | `delegate_match.rs` etc. | Small |
| 9 | Close escrow after settlement (or separate `close_escrow`) | `process_match_settlement.rs` | Medium |
| 10 | Validate `platform_fee_wallet != default` at init | `initialize_match.rs` | Small |
| 11 | Add 50-move draw `MoveResult::FiftyMoveRule` variant | `enums.rs`, `chess_logic.rs`, `make_move.rs` | Small |
| 12 | Wire prediction bet buttons to `placePredictionBet` | `page.tsx` | Medium |
| 13 | Add timeout claim call when clock hits 0 | `useChessClock.ts`, `page.tsx` | Small |
| 14 | Add rollback on failed optimistic move | `page.tsx` | Small |
| 15 | Wire all 6+ event types in `useMatchEvents` | `sdk/src/react/index.tsx` | Medium |

### P2 (medium)
| # | Action | File | Effort |
|---|--------|------|--------|
| 16 | Add prediction vault clawback/sweep | `claim_prediction_winnings.rs` | Medium |
| 17 | Fix FNV-1a Zobrist → keyed hash | `chess_logic.rs` | Medium |
| 18 | Fix K+B+B (same color) insufficient material | `chess_logic.rs` | Small |
| 19 | Align frontend clock to per-move countdown | `useChessClock.ts` | Medium |
| 20 | Add session key management UI | New component | Medium |
| 21 | Build SDK — tsconfig, build scripts, regenerated IDL | `sdk/` | Medium |
| 22 | Map 40 on-chain errors to user-friendly messages | Frontend | Small |
| 23 | Add `GameStatus.Aborted` to SDK types | `sdk/src/types.ts` | Small |

### P3 (low — nice to have)
| # | Action | File | Effort |
|---|--------|------|--------|
| 24 | Add draw-by-agreement instruction | New `agree_to_draw.rs` | Medium |
| 25 | Add 75-move auto-draw | `chess_logic.rs` | Small |
| 26 | Increase position history capacity or use hashmap | `chess_logic.rs` | Small |
| 27 | Emit `PayoutEvent`/`DrawPayoutEvent` | `process_match_settlement.rs` | Small |
| 28 | Add session key change cooldown | `set_session_key.rs` | Small |
| 29 | Deduplicate PDA helpers in SDK | `sdk/src/pda.ts` | Small |

---

## 8. GitHub Issues

### Docs
1. **Consolidate architecture.md and spec.md** — 60% overlap, merge into single architecture doc
2. **Create frontend architecture guide** — extract from `current-state.md`
3. **Fix chess-engine.md** — test counts, feature claims, board indexing
4. **Update magicblock.md** — disabled crank, custom session keys, actual delegation flow
5. **Delete speculative planning docs** — 6 files to remove
6. **Update security-audit.md** — current bug status, accurate counts
7. **Set up Docusaurus deployment** — docs subdomain, Vercel, nav link

### Bugs
8. **Castling rights not revoked on rook capture** (P0)
9. **Prediction platform fees trapped in vault** (P0)
10. **Shared session key enables turn hijacking** (P0)
11. **Escrow not closable after settlement** (P1)
12. **No authorization on delegate/undelegate** (P1)
13. **Invalid platform_fee_wallet locks match funds** (P1)

### Frontend
14. **Clock model mismatch** — chess clock vs per-move timeout (P1)
15. **Match creation sends dummy pubkeys** (P0)
16. **Resign doesn't call on-chain** (P0)
17. **Hardcoded IDL** — replace with generated (P0)
18. **Prediction bet UI not wired** (P1)
19. **Optimistic move no rollback** (P1)

### SDK
20. **Build pipeline** — tsconfig, scripts, regenerated IDL (P2)
21. **Missing methods** — abortMatch, closeMatch, setSessionKey (P0-P1)
22. **Type fixes** — ChessMatch fields, enum deserialization, camelCase (P1)
23. **React mutation hooks** (P2)

### Tests
24. **Set up CI pipeline** (P1)
25. **Add frontend test harness** (P1)
26. **Add SDK integration tests** (P1)
27. **Fuzz test escrow safety and prediction math** (P2)

---

## 9. Apple Developer Grade Standards Assessment

### Current Score: C+

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Code correctness | B | 1 critical engine bug, 2 critical feature bugs |
| Test coverage | C | 72% on-chain, 0% frontend/SDK, no CI |
| Type safety | D | All SDK files @ts-nocheck, unpublishable |
| Documentation | C | 25+ outdated claims, 6 files should be deleted |
| Error handling | C | 40 on-chain errors → 1 generic frontend toast |
| Auth/security | C | Session key hijacking, no delegation auth |
| Contributor UX | D | No CONTRIBUTING.md, no CI, no PR template |
| Branch strategy | D | Everything on `main`, no PR process |

### What "A" Looks Like
- Zero known critical/high bugs in engine
- CI runs all 4 test harnesses + frontend + SDK on every push
- SDK has build pipeline, generated IDL, 100% method coverage, typed errors
- Every on-chain error has user-friendly frontend message
- Docs accurate, navigable, hosted, with changelog
- Branch protection + PR template + review checklist
- Pre-commit hooks: lint, format, typecheck, test

### Recommended Contribution Patterns
```
main ← feature/XXX branches
  │
  ├── PR required for main
  ├── CI must pass (unit + litesvm + mollusk + anchor-ts + frontend + sdk)
  ├── PR template: what, why, how tested, breaking changes
  └── Review checklist: security, auth, math, state machine, events, tests

Commit format: Conventional Commits
  feat(engine): add draw-by-agreement instruction
  fix(sdk): abortMatch now calls on-chain instruction
  docs(chess-engine): fix test counts and board indexing
```

### Top 3 Standards Fixes (immediate)
1. **Add CI**: GitHub Actions running `cargo test`, `anchor test`, frontend lint
2. **Fix SDK types**: Regenerate IDL, add tsconfig, enable type checking
3. **PR template + CONTRIBUTING.md**: How to set up, test, submit
