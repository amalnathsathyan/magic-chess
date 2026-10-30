# ZUG Arena (Magic Chess) — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.
The product is branded **ZUG Arena** ("Every move matters."). It is live on devnet at
https://playzug.xyz (the old arena.chessmagic.workers.dev redirects there). `dev` is the only branch, and feature PRs target `dev`.

## Git workflow (required for every agent and session)

`dev` is the only long-lived branch and everything deploys from it. Don't commit or push directly to `dev` unless the user explicitly asks for that change to go straight to `dev`.

1. Open a new branch only when the work needs one. Reuse an existing branch when the work is a follow-up to an open PR (push to that PR's branch) or continues work already on a branch. Start a new branch only for a new, separate piece of work with no open branch or PR for it.
2. Name a new branch for what it does: `<type>/<short-description>` in lowercase kebab-case, e.g. `fix/move-clock-skew` or `feat/free-match-settlement` (types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`). Never use random or generated names (session ids, hashes, `claude/...-abc123`); if a tool assigned such a branch, create a descriptive one from it before pushing. Create it from the latest `dev`:
   `git fetch origin && git checkout -b <type>/<short-description> origin/dev`.
3. Commit with Conventional Commits messages. Do not add a `Co-Authored-By: Claude` (or any Claude co-author) trailer.
4. Push the branch (`git push -u origin <branch>`) and open a PR into `dev` using `.github/PULL_REQUEST_TEMPLATE.md`.
5. Get CI green before asking for merge. After a PR merges, new work starts a new branch from `dev`.
6. When the task is done, update this file's status and next-steps sections in the same PR.

## Project Layout

```
magic-chess/
├── magic-chess-program/        # Anchor workspace (Rust program + tests)
│   ├── programs/magic_chess/   # On-chain chess engine (21 instructions)
│   │   └── src/
│   │       ├── lib.rs          # Instruction dispatch
│   │       ├── constants.rs    # PDA seeds, validation limits
│   │       ├── errors/         # 58 error variants (6000–6057)
│   │       ├── events/         # 8 event types
│   │       ├── instructions/   # instruction handlers
│   │       ├── state/          # ChessMatch, CastlingRights, Piece, Enums, PredictionPool
│   │       └── utils/          # chess_logic.rs (full engine), payout_logic.rs
│   └── tests/                  # Unit + LiteSVM + Mollusk CU + Anchor TS
├── sdk/                        # @magic-chess/sdk TypeScript SDK
│   └── src/
│       ├── client.ts           # MagicChessClient
│       ├── types.ts            # All TypeScript types
│       ├── pda.ts              # PDA derivation
│       ├── react/index.ts      # React hooks (useMatch, useMatches, usePlayerMatches)
│       ├── utils/fen.ts        # boardToFen, fenToBoard
│       └── magicblock.ts       # MagicBlock endpoints, delegation helpers
├── frontend/                   # ZUG Arena: Next.js 15 static export on a Cloudflare Worker
├── backend/                    # Fastify + Postgres: indexer, SSE, gas sponsor, ratings
├── docs/                       # Docusaurus site (GitHub Pages, deploys from dev)
├── research/                   # Earlier R&D notes + agent-findings/ reports (reference, unmaintained)
└── .claude/                    # Claude Code settings

Local only (gitignored): .agents/skills/, .claude/skills/ (except .claude/skills/magicblock/, which is checked in), skills-lock.json, marketing/
```

## Key Technical Details

- **Anchor 1.1.2**, Rust, Solana 2.x crates
- **Program ID**: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
- **Build**: `cargo build-sbf --tools-version v1.52` (macOS 12 compat)
- **MagicBlock**: Ephemeral Rollups via delegation program `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- **Crank**: Task Scheduler `Magic11111111111111111111111111111111111111`
- **Session Keys**: `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`

## Architecture

Two PDAs per match:
- `chess_match` (seeds: `["chess_match", match_id]`) — full game state, board, players, status
- `match_escrow` (seeds: `["match_escrow", match_id]`) — SPL token account, PDA-owned

State machine: `WaitingForOpponent` → `Active` → Terminal (`WhiteWins` | `BlackWins` | `Draw`)

L1 holds tokens + settlement. ER handles gameplay (make_move, session keys, crank). Tokens never leave L1.

### Off-chain data flow

- **Chain is the source of truth.** The frontend reads open games and "your past matches" straight from
  the chain through the SDK. Live games, the global Recent games list, review/replay, profiles, the
  Ladder and XP are all served by the backend from Postgres.
- **Two writers keep Postgres in sync, and both are idempotent:**
  1. `chainIndexer.ts` follows transaction logs (base layer for create/join/settle, the rollup for moves)
     and applies program events through `eventIngest.ts`. This is the only source of individual moves.
  2. `matchReconciler.ts` (new) sweeps every `ChessMatch` account every 60s, both program-owned on base and
     delegated ones read from the rollup. It inserts missing games and applies joins, results, the final
     position and payouts. This recovers games played while the server slept or the DB was down. Moves
     can't be recovered this way, so such games show the final board with a note that moves are missing.
- Results from either path go through `updatePlayerStats` (Elo + stats + XP) behind a status guard, so a
  game is never counted twice.
- **Elo** (`rating.ts`): starts at 1200; K=40 for a player's first 30 rated games, then 20.
- **XP** (`xp.ts`, `xpLedger.ts`): every award is a row in `xp_events` (player, match, kind), and the
  running total is `player_stats.xp`. Per game: 10 for playing, +20 for a win or +8 for a draw, +1 per full
  move past move 10 (max +15), and +25 for the first win of the UTC day. A game under 6 plies earns 2 XP;
  after 5 games against the same opponent on the same day, games earn nothing. Level L→L+1 costs
  100+25·(L−1) XP. Tiers: Pawn 1, Knight 5, Bishop 10, Rook 15, Queen 20, King 30.
- **Migrations** run on backend start (`backend/src/db/migrate.ts`, 001–009). `/api/health` reports DB
  readiness, the DB error with a fix hint, stored row counts, and indexer/reconciler status.

## Testing

```bash
# Unit tests (pure Rust, ~0s)
cargo test -p magic_chess --lib --test unit_tests

# LiteSVM integration (in-process, SPL token flows)
cd magic-chess-program/programs/magic_chess && cargo test -- litesvm

# Mollusk CU benchmarks
cargo test --features integration-tests -p magic_chess --test cu_benchmarks

# Anchor TypeScript tests (requires local validator)
cd magic-chess-program && anchor test

# Backend (DB tests run only when TEST_DATABASE_URL points at a scratch Postgres)
cd backend && npm run typecheck && TEST_DATABASE_URL=postgres://... npm test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

## Deploy

See `DEPLOY.md` for full instructions. Quick:
```bash
cd magic-chess-program
cargo build-sbf --tools-version v1.52
anchor deploy --provider.cluster devnet
```

## Active Skills

Checked in (loads in every session, including cloud sessions):

- `magicblock` (`.claude/skills/magicblock/`) — MagicBlock dev skill vendored from
  magicblock-labs/magicblock-dev-skill: ER/delegation, Magic Actions, session keys, cranks, VRF, fees,
  debugging. Upstream commit and update steps are in its `SOURCE.md`.

Installed locally (not tracked in git; reinstall from `skills-lock.json`):

- `solana-audit` — Security audit workflows and vulnerability taxonomies
- `solana-incident-response` — Incident triage and post-mortem

## Current State

Program tests: 182 unit (`--test unit_tests`) + 59 LiteSVM + 15 payout flow + 11 Mollusk CU, all run in CI.
Prediction market instructions live on-chain (`prediction_enabled` flag, 5 instructions); no outcome-pool UI yet.
Frontend (ZUG Arena) and backend are live on devnet; see `docs/docs/deployment.md`.

## Devnet ZUG faucet: status and next steps (2026-10-30, devnet only)

Branch `feat/devnet-zug-faucet`. Testers on devnet hold no SOL, so the app hands out a devnet SPL
token ("ZUG", 6 decimals, fixed 1B supply) and makes it the default stake token. **Remove all of
this when the app moves to mainnet** (removal list in `docs/docs/features/devnet-faucet.md`).

- One-time token creation: `cd backend && npm run faucet:create-token`
  (`backend/scripts/create-devnet-zug.ts`): classic SPL mint + hand-rolled Metaplex metadata
  (logo via raw GitHub URL, JSON at `frontend/public/token/zug-devnet.json`), whole supply to a
  treasury keypair, mint authority revoked. Prints the env values.
- Backend: `services/faucet.ts` + `routes/faucet.ts`, migration 010 `faucet_claims`. Signup
  10000 ZUG on the first claim, 1000 ZUG once per UTC day after that (the signup day has no
  daily claim). Claims are keyed by Privy user *and* wallet (unique indexes; row inserted before
  the transfer, deleted on failure). Treasury key `FAUCET_TREASURY_PRIVATE_KEY` signs; the
  sponsor fee payer pays fee + ATA rent. Env in `backend/.env.example`.
- Frontend: `lib/stake-tokens.ts` (default token from `NEXT_PUBLIC_WAGER_*`, then SOL),
  `lib/faucet.ts`, `hooks/useFaucet.ts`, `components/lobby/FaucetBanner.tsx` (banner on
  `/arena`, card in `CreateMatchForm` and on the play page's join panel). The token dropdown
  lists ZUG first with the balance, presets 0/100/500/1000; the SPL balance check in
  `lib/wager.ts` says "Claim free ZUG first" when the default token is short.

Devnet ZUG mint (created by jason 2026-10-30): `AoeVGNnjuTAt92KZRhD59GbJTAwJSxpaTPmai8xmFSpK`, 6 decimals, 1B fixed supply.
`wrangler.toml` and the env examples point at it.

Next steps (jason):
1. Set `FAUCET_MINT` + `FAUCET_TREASURY_PRIVATE_KEY` on Render and `NEXT_PUBLIC_WAGER_MINT/SYMBOL/DECIMALS`
   in the Cloudflare build variables (same values as `wrangler.toml`), then merge so both redeploy.
2. Check the claim end to end with an embedded wallet (banner → toast → ZUG in the dropdown).
3. Not done: ratings/P&L cards still assume one stake token; a per-token P&L is a later change.

## Scheduled starts and abandoned open matches (2026-10-30)

Branch `feat/scheduled-match-start`. From devnet testing: many matches were created, nobody joined, and
they sat open for days. Creating a match now asks when it starts: **Now**, **In 10 min**, or **Pick a time**
(`datetime-local`, 2 minutes to 30 days ahead).

- **No program change.** The start time is written into the match id (`mc-<16 hex>-t<base36 minutes>`;
  `mc-<16 hex>` and the older `mc-<20 hex>` mean "now"), so the lobby (chain), play page, backend and
  bots all read it from the chain. Helpers: `sdk/src/utils/matchId.ts` (`buildMatchId`,
  `scheduledStartAt`, `matchStartState`, `isAppMatchId`) and the backend mirror
  `backend/src/services/matchSchedule.ts` (`/api/matches` returns `startsAt`, `openUntil`, `scheduled`,
  `startPhase`). Tests: `sdk/test/matchId.test.mjs`, `backend/test/matchSchedule.test.ts`.
- **Join window.** An open match is joinable for 60 minutes after its start (`OPEN_MATCH_WINDOW_SECONDS`).
  Upcoming: lobby row says "Starts 7:00 PM (in 9:41)", play page counts down with the join button disabled,
  the invite message and challenge card carry the start time. Expired: hidden from the lobby except for the
  creator, the play page says nobody joined and the creator's "Cancel and get refund" (`abort_match`) becomes
  the primary button. `frontend/lib/match-start.ts` formats all of this.
- **Limits.** The chain doesn't enforce the window: `join_match` has no start or deadline check, so a raw SDK
  call can join early or late (the clock then starts at that join). `abort_match` is creator-only, so an
  abandoned match's stake and the sponsor's rent (~0.0161 SOL per match) stay locked until the creator
  cancels. The backend cannot clean these up today.

Next steps (program, fold into the planned rework: free-match path, `payer` pin, permissionless undelegate):
- Add `starts_at: i64` and `join_deadline: i64` to `ChessMatch` (layout change; existing devnet accounts
  must be closed or ignored). `initialize_match` takes `starts_at` (0 = now) and sets `last_move_timestamp`
  to `max(now, starts_at)` on join; `join_match` requires `starts_at <= now <= join_deadline`.
- Let anyone call `abort_match` once `now > join_deadline` while `WaitingForOpponent`, refunding the creator
  and sending rent to the rent payer. A backend keeper (same fee payer as the sponsor) then sweeps expired
  open matches found by the reconciler, which also stops "settle" calls landing on games that never started.
- Until then, consider a lobby notice to creators of expired matches (the arena's `TimeoutClaims` pattern).

## Gameplay: status and next steps (handoff, 2026-10-07)

Owner so far: the "Gameplay fixes from live testing" thread. This section is the handoff for the next agent.

### Shipped on dev (PR #48)
- Phones: `MoveList` no longer scrolls the whole page (it used `scrollIntoView` every second), which also cancelled touch drags.
- `runTransaction` in `frontend/app/play/page.tsx` no longer awaits the backend history call (the DB can be asleep). A pending transaction locks the board, so this was why moves failed.
- Faster create/join: the gas sponsor's `confirmFast` (`backend/src/services/solanaSponsor.ts`) polls signature status alongside the websocket. Open matches poll every 1.5s so the creator sees the join.
- End-of-game banner says who won and why (`describeEnd` in the play page). When a clock runs out both players see it. Embedded (Privy) wallets auto-claim the timeout win without a popup (`claim_timeout_win` is in `GAMEPLAY_DISCRIMINATORS` in `SolanaProgramProvider.tsx`). External wallets get the button.
- Sounds for opponent moves, game start and end. Every sound is primed on the first tap so phones play them.

### Shipped with this section (PR #51)
- A "What's happening" panel (`frontend/components/chess/MatchJourney.tsx`) walks players through created → opponent joins → play → save result to Solana → pay out. It covers the move clock, why the game ended, the payout after the fee, and that either player can finalize. The finalize button names its step (1 of 2 saving, 2 of 2 paying).

### Automatic payout: findings and the decision waiting on jason
Finished games still pay out only when a player presses "Finalize and settle payout" (undelegate on the rollup, then `process_match_settlement` on base).
- Re-enabling the task scheduler (`TASK_SCHEDULER_ENABLED` in `schedule_timeout.rs`) would not fix this. The scheduler isn't available on the rollup, where games end (see the comment above the scheduling block in `make_move.rs`). The settlement task it schedules also passes no token accounts, so it couldn't pay anyone.
- `process_match_settlement` needs no player signature; any fee payer can send it. `undelegate_match` requires a player signer.
- Proposed design (jason has a decision card in the thread and hasn't answered yet): (1) the program lets anyone call `undelegate_match` once the game is terminal (WhiteWins/BlackWins/Draw/Aborted), keeping the player check while Active; (2) a backend `MatchSettler` uses the sponsor fee payer. It finds terminal, unpaid matches (the `matches` table, or the reconciler's sweep), undelegates on the rollup, waits for the base account to come back, creates the payout ATAs (idempotent) and sends `process_match_settlement`, behind an `AUTO_SETTLE_ENABLED` flag that stays off until the program upgrade is on devnet; (3) the panel says "Paying out automatically" when that flag is on.
- Do not start step (1) without jason's explicit approval. It loosens an authorization check and needs a devnet program upgrade that jason deploys. The deployed program already lags the source (see project memory).
- Silently signing payout transactions from the player's page (quiet-signing `process_match_settlement`) was tried and rejected, because it would sign without the player approving. Don't revisit that.

### Stale timed-out games (2026-10-10)
A game whose side to move runs out of time stays `Active` on-chain until the *waiting* player sends
`claim_timeout_win` (only a player may sign it). Unclaimed games sat in "Live now" for days.

Shipped (no program change):
- Backend `services/matchTimeout.ts`: an `Active` game is timed out once `last_move_at + move_timeout_seconds`
  plus a 120s grace has passed. The grace covers `last_move_at` lagging the chain by up to one reconciler sweep.
  `/api/matches` and `/api/matches/:id` return `timedOut`, `timedOutSide` and `timeoutAt`, and
  `/api/matches?timedOut=true|false` filters with the same rule in SQL (`TIMED_OUT_SQL`).
- Lobby "Live now" asks for `timedOut=false`. The arena shows "You won N games on time" with a Claim win link to
  the play page (`components/lobby/TimeoutClaims.tsx`). Spectate reads the on-chain clock: "Out of time"
  badge, "Out" clock, who must claim, and predictions closed.
- Tests: `backend/test/matchTimeout.test.ts` and `matchTimeout.db.test.ts` (Postgres).

Next (jason, from a local checkout, with a devnet redeploy): end these games without a player.
Two routes, both program changes:
1. **Backend keeper (simplest).** Let anyone call `claim_timeout_win` once the clock ran out (the winner comes
   from `current_turn` and the on-chain clock, never from the signer) and let anyone `undelegate_match` once the
   game is terminal. A keeper then finds games with `TIMED_OUT_SQL`, claims on the rollup, undelegates and calls
   `process_match_settlement` on base (already permissionless; pin its unchecked `payer` in the same upgrade).
2. **Task Scheduler crank.** Findings from `.claude/skills/magicblock/references/cranks.md` against our
   `schedule_timeout.rs`. Flipping `TASK_SCHEDULER_ENABLED` alone won't work:
   - Availability is unclear. `make_move.rs` skips scheduling when delegated ("Magic111 Task Scheduler not
     available on ER"), so every real game skipped it. The skill says tasks are scheduled *on the ER* through
     the Magic program (`Magic111…`, our `TASK_SCHEDULER_ID`). Confirm on devnet with
     `magicblock-engine-examples/crank-counter/anchor` before building on it.
   - The commented-out CPI doesn't match the API: `ScheduleTaskArgs.instructions` is `Vec<Instruction>`
     (we hand-roll `Vec<Vec<u8>>` and pass an empty vec, so a task would do nothing) and the account list is
     unverified. `magicblock-magic-program-api` 0.10.1 is already a dependency; use its types.
   - The scheduled instruction runs with `crank_signer_pda(task_authority)` as its only signer (read-only), so
     it can't call `claim_timeout_win` as written. It needs a crank-only path that checks that derived key.
   - Task ids are validator-global, and update/cancel only work for the same authority. Today each move is
     scheduled by the mover, so white can't cancel black's task. Make a program PDA the task authority
     (`invoke_signed`) so one authority schedules and cancels.
   - Schedule and cancel apply asynchronously. Make the timeout handler a no-op when the game is no longer
     `Active` or the clock hasn't run out, and don't rely on cancel.
   - A task only acts on the rollup. Paying out still needs commit + undelegate, then settlement on base
     (the Magic Actions plan above).
   Route 1 is less work and easier to watch; the crank can come later.

### Other next steps
- Not verified on a real phone yet: retest drag and tap moves, sound and the bottom nav on iOS Safari and Android Chrome.
- Timeout wins for external wallets (Phantom etc.) still need a press of "Claim timeout win".

### MagicBlock Validator v1.0 review and free-match settlement (2026-10-07, not started)
Research only; no code changed. Pick up from here.

**Free (0-wager) matches pay for a token path they never use.** Today a free match creates a wSOL ATA for each player (`frontend/lib/wager.ts:72`, `play/page.tsx:559` with `0n`), always creates the `match_escrow` token account (`initialize_match.rs`), then at settle creates 3 payout ATAs (`buildSettlementInstructions`), makes 0-amount transfers and closes the escrow. Each ATA is ~0.00204 SOL of sponsor money that is never reclaimed. Proposed program change:
- `initialize_match` / `join_match`: token accounts and escrow become `Option<>` (or a separate `initialize_free_match`), required whenever the wager is > 0 (`require!(total_pot == 0 || accounts.is_some())`; `total_pot` is set on-chain, so it can't be spoofed).
- New `settle_free_match` (or a `total_pot == 0` branch in `close_match`): once terminal, close `chess_match` directly. One instruction, no ATAs, no token CPI, ~0.0161 SOL rent back to the sponsor.
- Frontend skips `buildWagerInstruction` / `buildSettlementInstructions` when the wager is 0.
- Same upgrade: `process_match_settlement.rs:61` `payer` is an `UncheckedAccount`, so whoever settles first picks who gets the escrow rent the sponsor paid. Constrain it.

**Auto-payout alternative to the backend `MatchSettler`: Magic Actions.** `ephemeral-rollups-sdk` 0.16.2 (in use) already has it; 0.17.3 is latest with the same action API, but crank/vrf move behind cargo features.
- Terminal paths (`make_move`, `resign_game`, `claim_timeout_win`) schedule `MagicIntentBundleBuilder::commit_and_undelegate(&[chess_match]).add_post_undelegate_action(CallHandler{..})`, the builder `undelegate_match.rs` already uses. Use post-undelegate, not post-commit: after a commit alone `chess_match` is still owned by the delegation program on L1.
- The action can be `process_match_settlement` unchanged (same 7 accounts, permissionless, `payout_processed` + escrow close stop double pay). The delegation program's extra trailing accounts land in `remaining_accounts`. Don't trust the `#[action]` macro's account order; MagicBlock's own example looks shifted.
- Escrow authority: a global `["action_auth"]` PDA signs via `build_and_invoke_signed`; fund `["balance", action_auth, idx]` once with `top_up_ephemeral_balance` and don't delegate it. A commit fee of ~0.001 SOL applies.
- Accounts are `Option<>` on those instructions so normal moves don't carry them. Simpler first step: a rollup `finish_match` instruction the backend calls.
- If the action fails (e.g. a missing ATA; actions can't create ATAs), the validator retries commit+undelegate without it, so the "Finalize" button stays as the fallback. Free matches have no ATAs, so nothing can fail there; do the free-match change first.
- Same loosened-authorization concern as above: needs jason's approval and a devnet upgrade.

**Smaller gameplay fixes (no program change, effort S unless noted).** Items marked *done* shipped in the
"Improve game flow UX end to end" branch (`fix/game-flow-ux`, 2026-10-30); the rest are still open.
- `subscribeToMatch` (`sdk/src/client.ts:218`) and `useMoveTransactionNotifications.ts:120` never resubscribe after a rollup restart or dropped socket; moves arrive late through the 8s fallback poll (`play/page.tsx:250`). Add a `getSlot` heartbeat and rebuild, plus a "rollup reconnecting" banner instead of a frozen board or a "Match unavailable" card (`play/page.tsx:853-862`).
- Per move, `sendInstructionWithSession` (`client.ts:162-179`) fetches a fresh blockhash and simulates; `makeMove` then reads the account again (`client.ts:415`) and the frontend discards it. Cache the blockhash ~30s, drop the simulation and the read (~100–300 ms per move).
- Runtime lookup (base → router → rollup, `sdk/src/magicblock.ts:243-281`) repeats on every `getMatch`/`subscribeToMatch`/`resign`/`claimTimeout`, 2–3× on reload. Share the per-match cache `makeMove` has (`client.ts:184-194`).
- *Partly done:* `useMagicBlock.ts` no longer forgets the session key on a generic `AccountNotFound` (the wallet signs that one move and the key is tried again next move). Still open: no rebroadcast for dropped moves (`play/page.tsx`, `submitLegalMove`).
- *Done:* the timer adds `serverOffsetMs` from `useMatchRealtime` (the server's `serverTime` on presence, clock and snapshot events) to the device clock, on the play and spectate pages. The embedded-wallet auto-claim retries up to 5 times (3s, then 8s apart) instead of giving up after one rejected `claim_timeout_win`.
- White's clock starts at join on L1 (`join_match.rs:81`) before delegation is seen; `waitForDelegation` polls at 1s (`sdk/src/magicblock.ts:113`). Poll at ~250 ms (effort M to start the clock on the first rollup tx).
- *Done:* Finalize reads the base account once after `client.undelegateMatch` (which already waits for the undelegation).
- Duplicate polling: `useMatch` 3–8s, log poller 2.5s, backend `refreshConnectedMatches` 3s (`matchRealtime.ts:173`), indexer 3s (`chainIndexer.ts:71`, runtime cache 30s TTL), spectate 3–10s. Let SSE `match.snapshot` drive refreshes.

**Later / optional:**
- Ephemeral accounts (effort M): `position_history` is 1,604 of `ChessMatch`'s 2,186 bytes (`state/chess_match.rs:29-30`). An ephemeral PDA on the rollup cuts ~0.0112 SOL rent per match; it needs a fallback for undelegated play. `delegation_uid` (68 bytes) is derivable as `"chess-{id}"`. Chat and draw offers fit ephemeral accounts too.
- Token-2022 (effort L): the classic Token program is hard-coded in the program (`Program<Token>`, 10 files), SDK (`client.ts:39`), frontend (`play/page.tsx:468`, `lib/wager.ts`) and sponsor (`solanaSponsor.ts:201,206`). Transfer-fee mints break pot accounting. Wait until a Token-2022 token is actually wanted.
- Private payments: no gain while wagers stay in the L1 escrow.

Suggested order: free-match path + `payer` fix (one upgrade) → small fixes above → auto-payout via Magic Actions.

## Game flow UX pass (2026-10-30, branch `fix/game-flow-ux`)

Frontend only; no program, SDK or backend change. Found by reading the whole create → join → play → finalize flow.
- **Lobby shows every stake token.** "Open matches" used to drop any match whose mint wasn't `NEXT_PUBLIC_WAGER_MINT`
  (a custom token, or the devnet ZUG token another thread is adding), so those matches were only reachable by link.
  Amounts and symbols now come from the mint (`useMintDetails`) in both lists on `/arena`.
- **"Open" tab under Your games** lists matches you created that nobody joined. Before, leaving the play page lost
  the match unless it showed in Open matches.
- **Opponent presence was always "Offline".** The stream only marks a side online after a signed proof, and the play
  page never sent one. Embedded (Privy) wallets now sign it silently on load (`useMatchRealtime.verifyPlayerPresence`);
  external wallets aren't prompted. `PlayerRow` shows the dot only when a side is confirmed online, never a grey one.
- **Clock skew, auto-claim retry, Finalize poll, session-key fallback:** see the *done* items above.
- **Stake balance check for SPL tokens.** `buildWagerInstruction` checks the player's token balance for a non-SOL
  mint before building create/join, with a "this stake needs X ZUG" message instead of a failed transaction.
- **Free matches say "close", not "pay out"** (Finalize button, journey panel, spectator note). After payout the panel
  offers Review and New match; a cancelled match says "Cancelled and refunded".

Next (still open): resubscribe the account stream after a dropped socket or rollup restart; rebroadcast dropped
moves; let the backend keeper claim and settle (program change, needs jason).
## Gameplay: status and next steps

Fixed after jason's live test (2026-10-06):
- The page no longer jumps on phones: `MoveList` scrolled the whole page with `scrollIntoView` on every re-render (once a second), which also cancelled touch drags.
- "Confirming transaction…" no longer hangs: `runTransaction` in `frontend/app/play/page.tsx` stopped awaiting the backend history call (the DB can be asleep). That pending state also locked the board, which is why moves failed.
- Create and join confirm faster: the gas sponsor (`backend/src/services/solanaSponsor.ts`, `confirmFast`) polls the signature status instead of waiting only on the RPC websocket. An open match also polls every 1.5s so the creator sees the join.
- Finished games say who won and why (timeout, resignation, checkmate, draws) above the board.
- When the side to move runs out of time, both players see it. An embedded (Privy) wallet claims the timeout win itself, without a popup (`claim_timeout_win` is in the quiet-signing list). External wallets get the "Claim timeout win" button.
- Sounds play for the opponent's moves and for game start and end, and all sounds are unlocked on the first tap so phones play them.

Next steps:
- Timeouts still need a claim and "Finalize and settle payout" still needs a press, because the task-scheduler crank is disabled. Re-enabling the crank (or settling from the backend) would end games with no action from players.
- Not verified on a real phone yet; retest drag and tap moves, sound and the bottom nav on iOS Safari and Android Chrome.

## SDK on npm: status and next steps (handoff, 2026-10-10)

`@magic-chess/sdk` (`sdk/`) had full source but couldn't be published: it shipped raw TypeScript
(`main: src/index.ts`). Branch `feat/sdk-npm-package` makes it a real package. Not published yet.

### Done
- `tsup` (`sdk/tsup.config.ts`) builds ESM + CJS + `.d.ts` for `.` and `./react` into `sdk/dist/` (gitignored).
  `package.json` has an `exports` map, `files: ["dist"]`, `publishConfig.access: public`, react as optional peer.
- The frontend now consumes `sdk/dist`, not `sdk/src`; its `prebuild`/`predev` run
  `cd ../sdk && npm ci --include=dev && npm run build` and copy the agent skill to `frontend/public/skill.md`
  (served at playzug.xyz/skill.md, gitignored). `npm install --include=dev` rewrote the SDK lockfile without its
  optional peers, which then broke `npm ci` in CI. Don't add a `prepare` script to the SDK: the
  frontend's `npm ci` runs it for the `file:../sdk` dep before the SDK's own deps exist, which broke Workers Builds. Editing the SDK with the frontend running:
  `cd sdk && npm run dev` (tsup watch).
- Fixed: Node ESM consumers crashed on `import { BN } from "@anchor-lang/core"` (anchor is CJS for Node).
  `client.ts` imports `BN` from `bn.js` (now a dependency).
- `sdk/test/smoke.mjs` imports the built package by name in ESM and CJS. `prepublishOnly` = typecheck +
  build + test + smoke (tests import `dist/`). CI uses `npm ci` (keep `sdk/package-lock.json` in sync) and runs
  build + test + smoke + `npm pack --dry-run`.
- `.github/workflows/publish-sdk.yml` publishes on a `sdk-v<version>` tag via npm trusted publishing (OIDC).
- Publishing guide: `DEPLOY.md` → "Publish the SDK". npm README: `sdk/README.md`.

### Agents (2026-10-17, branch `feat/agent-sdk`)
- `connectMagicChess({ keypair })` (`sdk/src/connect.ts`) and agent methods on `MagicChessClient`: `openMatch`
  (wraps SOL + create, one tx), `joinOpenMatch` (stake + join + delegate, one tx, like the app), `waitForOpponent`,
  `waitForTurn`, `makeMoveUci`, `playMatch(matchId, chooseMove)`, `finishMatch` (undelegate + payout ATAs + settle),
  `cancelOpenMatch`. Helpers and `ZUG_DEVNET` (fee wallet, 100 bps, wSOL, api.playzug.xyz) in `sdk/src/play.ts`.
  Agents pay their own fees; the gas sponsor needs a Privy token, so it isn't used.
- `matchToFen` fixes a real bug: `boardToFen` wants `"White"/"Pawn"` but `ChessMatch.board` has `"white"/"pawn"`,
  so the old docs example threw. The frontend has its own `matchToFen` in `lib/match-board.ts`; it could switch.
- `zug` CLI (`sdk/src/cli.ts`, bin in `package.json`, chess.js for `legalMoves`) and the agent skill
  `sdk/skills/zug-arena/SKILL.md`, both shipped in the npm package. `sdk/CHANGELOG.md` feeds the GitHub release
  that `publish-sdk.yml` now creates.
- The skill is linked from the landing page ("Build on ZUG" and the footer), `docs/docs/intro.md`,
  `build/agents.md` and `build/sdk.md`, all pointing at playzug.xyz/skill.md.
- Not run against devnet yet: the cloud sandbox can't reach Solana RPC. First thing to do from a local checkout:
  `zug wallet --new`, `zug airdrop 1`, `zug open`, join from the app, play a few moves, `zug finish`.
- The escrow rent `finishMatch` returns defaults to the creator (`players[0]`); for app-created (sponsored)
  matches that should be the sponsor, which the unchecked settlement `payer` can't tell apart (see below).

### Next steps (owner action needed)
- The owner creates the npm org `magic-chess`, runs `npm login`, does the first `npm publish` from `sdk/`,
  then adds the trusted publisher on npmjs.com (steps in `DEPLOY.md`).
- After publishing: drop the "if the package isn't on npm yet" note in `docs/docs/build/sdk.md` and the "pending" wording in `docs/docs/intro.md` and `docs/docs/roadmap.md`. Docs import only from `@magic-chess/sdk` and `@magic-chess/sdk/react` (the `exports` map blocks deep paths like `/utils/fen`).
- Worth doing before 1.0: a mainnet/devnet cluster option (program ID and router are devnet-only today),
  an example app (`examples/node-bot` playing via session keys), and API docs from TSDoc (typedoc).
- CJS `react` entry bundles its own copy of the client (no code splitting in CJS); fine for now, revisit if
  `instanceof MagicChessClient` across entries matters.
## Share cards: status and next steps (2026-10-10)

Three shareable 1200×675 PNG cards, drawn on a canvas with the site's fonts (`frontend/lib/share-card.ts`)
and shown in one dialog (`frontend/components/share/ShareCard.tsx`: preview, Download PNG, Copy image,
native Share image on phones, Copy link, and X / WhatsApp / Telegram links with a prefilled post):
- **P&L card** (own profile, once something was wagered): net = `totalWon − totalWagered`. The backend's
  `totalWon` is the full pot on wins and draws add nothing to it, so a draw refund counts as a loss of the stake.
- **Player card** (any profile): rating, rank ("#16 by rating", as on the profile page; the P&L card shows it too), level/tier, XP progress, rating curve, form, games/wins/win rate/best streak.
- **Result card** (review page, any finished game): result and reason, both players with rating change and XP,
  moves, length, and stake/pot. A "Show wager" switch hides the stake and pot on the card and in the caption.
- **Challenge card** (play page, creator of an open match): stake, move clock, "you play black", plus direct
  X / WhatsApp / Telegram buttons under "Copy invite link".

Fixed 2026-10-09: saving a profile failed after the wallet signed, because the backend's CORS list had no `PUT`
and the browser blocked the save request. Allowed methods now live in `backend/src/cors.ts`, and
`backend/test/cors.test.ts` checks the preflight for every method the API uses. The player card was checked in a
real browser (Chromium) with mocked profile data: it draws at 2400×1350 and the dialog's links and buttons work.

Next steps:
- Share links can't attach the image (X, WhatsApp and Telegram intents take text only); players download or
  copy the card and paste it. To get a preview image on posted links, serve per-profile/per-match `og:image`
  tags from the Worker (`frontend/_worker.js`) and render the PNG server-side (e.g. satori + resvg).
- "Games created" isn't tracked in `player_stats`; add it in the backend if the player card should show it.
- Count draw refunds in `total_won` (or add `total_refunded`) so the P&L is exact.

## Wallet menu: status and next steps (2026-10-09)

- Privy embedded wallets can export their private key from the wallet menu ("Export private key") and the
  Settings wallet card ("Export key"), via Privy's `useExportWallet` (`frontend/hooks/useExportPrivyKey.ts`).
  Privy shows the key in its own iframe modal, so it never reaches app code. External wallets don't see the option.
- The wallet menu shows the native SOL balance from the app's RPC (devnet), fetched each time the menu opens
  (`frontend/hooks/useSolBalance.ts`).

Next steps:
- Not tested against a live Privy session; check that the export modal opens on a phone. If Privy returns an
  error, confirm wallet export isn't blocked by a policy in the Privy dashboard.

## Domain move to playzug.xyz: status and next steps (2026-10-16)

- playzug.xyz serves the landing page and the app (routes like /arena, /play). arena.playzug.xyz and the old
  arena.chessmagic.workers.dev 301 to it with path and query kept (`frontend/_worker.js`,
  `REDIRECT_LEGACY_HOST` in `frontend/wrangler.toml`). Both domains are Worker custom domains on the `arena` Worker.
- api.playzug.xyz is a Render custom domain (CNAME, DNS only). docs.playzug.xyz is GitHub Pages (`docs/static/CNAME`, baseUrl `/`).
- DNS is on Cloudflare (registrar GoDaddy). Privy, Render `CORS_ORIGIN` and the Cloudflare build variables were updated by jason.
- Email: team@playzug.xyz via Cloudflare Email Routing to a Gmail inbox, sending through Brevo SMTP.

Next steps:
- After a few weeks on the new domain, drop the workers.dev origins from `backend/src/config.ts` and Privy.
- Fixed: the live indexer failed with `column "event_index" of relation "sync_events" does not exist`, because
  that column was added to migration 004 after production had run it. Migration 009 adds it.

## UI redesign: status and next steps (2026-10-27)

Branch `feat/app-redesign`. The whole frontend was restructured to show only the text that matters, in the main areas.
No logic, hooks, SDK calls or on-chain flows changed; only layout, styling and copy.

- **Shell** (`components/shared/Header.tsx`): one sticky top bar (Play, Ladder, Profile, Settings, Devnet tag, wallet) and a
  4-tab bottom bar on phones. `app/arena/layout.tsx` no longer renders a second header. Play is active on
  `/arena`, `/play`, `/spectate` and `/review`.
- **Design tokens** (`app/globals.css`): component classes (`panel`, `btn`, `btn-primary`, `btn-secondary`, `btn-sm`,
  `label`, `section-title`, `stage-tag`, `tnum`, `row-link`) live in `@layer components`, and the `*` border rule in
  `@layer base`. Unlayered CSS beats Tailwind utilities in v4, which is why `border-primary/xx` and size utilities were
  silently ignored before. Keep new component CSS inside a layer.
- **Lobby** (`app/arena/page.tsx`): open matches as rows (`MatchCard`, with a `compact` variant), a right column with
  "Your games" (In play / Finished) and "Live now", Recent games below. `CreateMatchForm` has stake presets.
- **Game pages** (play, spectate, review): board column sized by `lib/board-size.ts` (`fitBoardWidth`) plus a 360px
  side panel with the match facts (Stake / Pot / Clock), actions, `MatchJourney` (now one current step with a
  progress bar and a "How this match works" disclosure), moves and predictions.
- **Landing**: Hero, How it works (3 steps), Watch and predict / Build on ZUG, footer.
- **Copy**: user-facing text says "stake", never "wager" or "bet" (code identifiers unchanged).

Next steps:
- Check on a real phone (iOS Safari, Android Chrome): bottom bar with the safe area, board size, drag moves.
- Screenshots in the PR used mocked data (the cloud session couldn't reach the API or RPC). Do a pass against live devnet data.
- The prediction panel still says "Play points"; revisit when winner prediction gets real stakes.
