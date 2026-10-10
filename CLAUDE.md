# ZUG Arena (Magic Chess) — CLAUDE.md

On-chain FIDE chess engine on Solana with MagicBlock Ephemeral Rollups for gasless gameplay.
The product is branded **ZUG Arena** ("Every move matters."). It is live on devnet at
https://arena.chessmagic.workers.dev. `dev` is the only branch, and feature PRs target `dev`.

## Git workflow (required for every agent and session)

`dev` is the only long-lived branch and everything deploys from it. Never commit or push directly to `dev`.

1. For any new or major piece of work, start a fresh branch from the latest `dev`:
   `git fetch origin && git checkout -b <type>/<short-description> origin/dev` (types: `feat`, `fix`, `chore`, `docs`, …).
2. Commit with Conventional Commits messages. Do not add a `Co-Authored-By: Claude` (or any Claude co-author) trailer.
3. Push the branch (`git push -u origin <branch>`) and open a PR into `dev` using `.github/PULL_REQUEST_TEMPLATE.md`.
4. Get CI green before asking for merge. Small follow-ups to an open PR go on that PR's branch; after a PR merges, new work starts a new branch from `dev`.
5. When the task is done, update this file's status and next-steps sections in the same PR.

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
- **Migrations** run on backend start (`backend/src/db/migrate.ts`, 001–008). `/api/health` reports DB
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

**Smaller gameplay fixes (no program change, effort S unless noted):**
- `subscribeToMatch` (`sdk/src/client.ts:218`) and `useMoveTransactionNotifications.ts:120` never resubscribe after a rollup restart or dropped socket; moves arrive late through the 8s fallback poll (`play/page.tsx:250`). Add a `getSlot` heartbeat and rebuild, plus a "rollup reconnecting" banner instead of a frozen board or a "Match unavailable" card (`play/page.tsx:853-862`).
- Per move, `sendInstructionWithSession` (`client.ts:162-179`) fetches a fresh blockhash and simulates; `makeMove` then reads the account again (`client.ts:415`) and the frontend discards it. Cache the blockhash ~30s, drop the simulation and the read (~100–300 ms per move).
- Runtime lookup (base → router → rollup, `sdk/src/magicblock.ts:243-281`) repeats on every `getMatch`/`subscribeToMatch`/`resign`/`claimTimeout`, 2–3× on reload. Share the per-match cache `makeMove` has (`client.ts:184-194`).
- No rebroadcast for dropped moves (`play/page.tsx:632-640`). `useMagicBlock.ts:25` matches the generic `"accountnotfound"`, so a transient error can turn session keys off and bring wallet popups back mid-game (effort S–M).
- Timer compares the device clock to the chain's `lastMoveTimestamp` (`play/page.tsx:336-343`). A skewed device fires `claim_timeout_win` early, then `autoClaimedRef` blocks the retry (`play/page.tsx:749-758`). Estimate the offset.
- White's clock starts at join on L1 (`join_match.rs:81`) before delegation is seen; `waitForDelegation` polls at 1s (`sdk/src/magicblock.ts:113`). Poll at ~250 ms (effort M to start the clock on the first rollup tx).
- Finalize polls `getMatch` up to 20×1s (`play/page.tsx:701-707`) after `client.undelegateMatch` already waited for the undelegation (`client.ts:651-661`). Remove it.
- Duplicate polling: `useMatch` 3–8s, log poller 2.5s, backend `refreshConnectedMatches` 3s (`matchRealtime.ts:173`), indexer 3s (`chainIndexer.ts:71`, runtime cache 30s TTL), spectate 3–10s. Let SSE `match.snapshot` drive refreshes.

**Later / optional:**
- Ephemeral accounts (effort M): `position_history` is 1,604 of `ChessMatch`'s 2,186 bytes (`state/chess_match.rs:29-30`). An ephemeral PDA on the rollup cuts ~0.0112 SOL rent per match; it needs a fallback for undelegated play. `delegation_uid` (68 bytes) is derivable as `"chess-{id}"`. Chat and draw offers fit ephemeral accounts too.
- Token-2022 (effort L): the classic Token program is hard-coded in the program (`Program<Token>`, 10 files), SDK (`client.ts:39`), frontend (`play/page.tsx:468`, `lib/wager.ts`) and sponsor (`solanaSponsor.ts:201,206`). Transfer-fee mints break pot accounting. Wait until a Token-2022 token is actually wanted.
- Private payments: no gain while wagers stay in the L1 escrow.

Suggested order: free-match path + `payer` fix (one upgrade) → small fixes above → auto-payout via Magic Actions.
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
