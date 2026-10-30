# Program audit, 2026-10-30

Scope: the whole `magic_chess` Anchor program at `dev` commit `fb92c58` (21 instructions, state,
`chess_logic.rs`, `payout_logic.rs`, the prediction market), the sponsor's instruction allowlist in
`backend/src/services/solanaSponsor.ts` where it bears on the program, and the program changes
proposed for the next upgrade (scheduled start times, abandoned matches, permissionless settlement,
free matches, Magic Actions).

Method: manual line-by-line review of every instruction's account constraints and handler, the
state machine, every token transfer and PDA signer, arithmetic, and the chess engine's rules.
Unit tests (183) run locally. LiteSVM, payout-flow and CU tests compile locally but need the
program `.so`, which this environment can't build; CI runs them.

Severity: **Critical** = funds can be taken; **High** = funds can be taken under a realistic
condition, or funds locked; **Medium** = griefing, denial of service or sponsor loss;
**Low** = hygiene, UX, or defence in depth.

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Critical | Creator sets the match fee and fee wallet; a 100% fee to the creator drains the joiner's stake | **Fixed** (program + frontend guard) |
| 2 | Critical | `settle_prediction_pool` pays the "match winner" and "match loser" shares to any token accounts the caller names | **Fixed** |
| 3 | High | `cancel_prediction_bet` works after settlement; refunds are paid from other bettors' money | **Fixed** |
| 4 | High | Predictions can be placed with the result already known on the rollup (base-layer status lags) | Open, design decision |
| 5 | Medium | `delegate_match` has no status check; the loser can re-delegate a finished match and block settlement | **Fixed** |
| 6 | Medium | `initialize_prediction_pool` accepts a vault on the wrong mint, bricking predictions for that match | **Fixed** |
| 7 | Medium | `close_match` pays the match rent (~0.016 SOL, sponsor money) to whoever calls it | **Fixed** |
| 8 | Medium | `process_match_settlement` pays the escrow rent to an unchecked `payer` | **Fixed** (pinned to a player or the platform wallet; a `rent_payer` field can refine it later) |
| 9 | Medium | A match with `move_timeout_duration = 0` has no way to end if the opponent vanishes | **Fixed** (30 s floor, 7 day ceiling) |
| 10 | Low | Dead task-scheduler instructions (`schedule_timeout`, `cancel_timeout_task`) are callable by anyone | **Fixed** (removed, with the bincode/serde code) |
| 11 | Low | Fifty-move and threefold repetition end the game automatically; FIDE treats them as claims | Design note |
| 12 | Low | Prediction pool `platform_fee_bps` is stored but never used | Open, hygiene |
| 13 | Low | Draw payout gives the odd unit to Black; escrow rent on abort goes to the creator although the sponsor paid it | Note |

The chess engine (`chess_logic.rs`) was checked rule by rule (pawn moves and promotion, en passant
including the simulated-check path, castling through attacked squares and rook presence, castling
rights lost on rook capture, check and mate detection, stalemate, fifty-move, insufficient material,
repetition hashing). No rule bug found. The `halfmove_clock: u8` can't overflow because the game
ends at 100.

## Findings in detail

### 1. Creator-controlled fee and fee wallet (Critical) — fixed

`initialize_match` takes `platform_fee_basis_points_arg` (allowed up to 10,000 = 100%) and
`platform_fee_wallet_arg` from the creator and stores them. `process_match_settlement` then pays
`total_pot × bps / 10000` to any token account owned by that wallet. The joiner's UI showed only the
stake, never the fee. A creator who builds the transaction by hand (the sponsor will even pay for
it: the sponsor's `initialize_match` rule checks accounts, not arguments) can set a 100% fee to a
wallet they own and share the invite link. The joiner stakes, the game is played, and the whole
pot goes to the creator whatever the result. The prediction pool's `platform_fee_ata` has the same
owner check, so spectator money paid to the "platform" would go to the creator too.

Fix (program, no layout change): `PLATFORM_FEE_WALLET` is a program constant
(`ByBqw1sTTPjWQx6DEAvwT4srVyr4wUdf1R4V4wGoh8j6`, the wallet the frontend already uses) and
`initialize_match` requires it; the fee is capped at `MATCH_PLATFORM_FEE_MAX_BPS = 1000` (10%).
Change the constant together with `NEXT_PUBLIC_PLATFORM_FEE_WALLET`.

Fix (frontend, works against the currently deployed program): the play page shows the fee under
the pot and refuses to join a match whose fee wallet isn't this deployment's or whose fee is above
the configured rate, with a note that the match wasn't created here.

Tests: `test_initialize_rejects_foreign_fee_wallet`, `test_initialize_rejects_fee_over_cap`
(LiteSVM), `test_fee_over_cap_or_foreign_wallet_rejected` (payout flow), unit tests for the cap and
the pinned wallet. The old "100% fee" and "50% fee" payout tests were replaced.

### 2. Permissionless settlement pays player shares to arbitrary accounts (Critical) — fixed

`settle_prediction_pool` is permissionless and only checked the mint of `match_winner_ata` and
`match_loser_ata`. Anyone could call it with their own token accounts and take 10% + 5% of the
losing pool, or 50% + 25% of the whole pool when nobody predicted the result. Fix: the owners must
be the players implied by `game_status` (Black wins → `players[1]` is the winner; otherwise, and on
a draw, White is the "winner" account and Black the "loser"). Tests:
`test_settle_rejects_foreign_player_accounts`, `test_settle_draw_requires_white_then_black`.

### 3. Cancel after settlement (High) — fixed

`cancel_prediction_bet` didn't check `settlement_processed`. When nobody predicted right, settlement
pays the entire vault to the players and the platform, and the "no winner" branch of cancel then
refunded bettors first-come first-served from whatever remained, i.e. from other bettors' money
(the balance check only stops the last ones from failing). Fix: cancel requires
`!settlement_processed`. Test: `test_cancel_after_settlement_rejected`.

Design question left open: today both paths exist for "nobody predicted right": settle splits the
pool 50/25/25 to winner/loser/platform, and cancel (before settlement) refunds. Whichever runs
first wins. Pick one: refund everyone (make settle a no-op for that case) or always split (drop the
no-winner cancel branch). The sibling `WaitingForOpponent`/`Aborted` cancel branches are dead code,
since bets require `Active` and nothing goes back from `Active`.

### 4. Betting with the result known (High) — open

Games are played on the rollup. The base-layer `ChessMatch` stays `Active` until undelegation, so
`place_prediction_bet` (base layer) accepts bets after checkmate has happened on the rollup, right
up to the moment undelegation lands. Anyone watching the rollup can bet with certainty. The arena
still calls predictions "Play points", so no real money is at stake yet, which is why this is open.

Options for real stakes: (a) close betting at delegation (`require!(!is_delegated)`), which leaves
only the seconds between join and delegate; (b) record a `betting_closes_at` timestamp or move
count at creation and have the rollup copy the bet ledger (pool PDA delegated too, with stake
deposited on base and tallied on the rollup); (c) keep base-layer bets but let the match settlement
Magic Action commit the final state first and reject bets whose slot is after the recorded end.
(b) is the honest product; (a) is the one-line stopgap.

### 5. Delegation of a non-active match (Medium) — fixed

`delegate_match` only checked that the signer is a player. A match in `WaitingForOpponent` delegated
by its creator can't be joined or aborted on base. Worse, after a game ends (terminal status, not yet
settled) the loser can delegate it again, and `process_match_settlement` on base fails because the
account belongs to the delegation program. The winner can undelegate, but that lands asynchronously
and the loser can re-delegate first, so the pot stays locked as long as the loser keeps paying fees.
Fix: `delegate_match` requires `game_status == Active`. The frontend joins and delegates in one
transaction, so the status is `Active` by the time the delegate instruction runs.

### 6. Prediction pool with the wrong mint (Medium) — fixed

`initialize_prediction_pool` is permissionless and didn't tie `betting_token_mint` to
`chess_match.betting_token_mint`. One pool exists per match (PDA on the match id), so a vault created
on another mint makes every later bet fail the vault-mint constraint. Fix: constraint added. Test:
`test_init_pool_rejects_other_mint`.

### 7. Anyone closes a settled match and keeps the rent (Medium) — fixed

`close_match` had `close = payer` with no check on `payer`. Each `ChessMatch` holds about 0.016 SOL
of rent that the sponsor paid. Fix: `payer` must be a player or `PLATFORM_FEE_WALLET`. The sponsor's
allowlist already expected the sponsor to be the payer here; if the backend is to close matches it
should sign with the platform fee wallet or the next upgrade should store the rent payer (see 8).
Test: `test_close_match_rejects_stranger`.

### 8. Escrow rent to an unchecked payer (Medium) — fixed (2026-10-30 pass)

`process_match_settlement.payer` is an `UncheckedAccount` and receives the escrow token account's
rent. Whoever settles first picks the destination. The frontend passes the sponsor and the sponsor
allowlist enforces that for sponsored transactions, but a self-paid transaction can name anyone.
Pinning it to the platform wallet would break the live flow (the sponsor fee payer is a different
key). The clean fix is a `rent_payer: Pubkey` on `ChessMatch` written at `initialize_match`, used
as the rent destination in settlement, abort and close. That is a layout change (see "Upgrade plan").

### 9. No timeout means no exit (Medium) — fixed (2026-10-30 pass)

`initialize_match` accepts `move_timeout_duration = 0` ("no clock"). With no clock the only ways to
end a game are checkmate, a draw rule or resignation, so an opponent who leaves locks the stake
forever. The frontend always sends a positive clock, but the program should enforce a floor
(e.g. 30 seconds) and perhaps a ceiling. Needs an upgrade; no layout change.

### 10. Dead task-scheduler surface (Low) — fixed (2026-10-30 pass)

`schedule_timeout` and `cancel_timeout_task` are callable by anyone and write `active_task_id`.
Nothing reads it while `TASK_SCHEDULER_ENABLED` is false. Harmless, but remove them (and the
`bincode`/`serde` code) in the next upgrade to shrink the attack surface and the binary.

### 11, 12, 13. Notes

- Fifty-move and threefold repetition are applied automatically in `validate_and_apply_move`
  (FIDE: claims; 75-move and fivefold are automatic). Fine for a product, but say so in the rules
  page. Repetition hashing includes the en passant square whenever a pawn double-pushed, so a
  repetition where only the (unusable) en passant square differs isn't detected. Conservative.
- `PredictionPool.platform_fee_bps` is written and never read; the split comes from constants.
- `process_draw_payout` gives the odd unit to Black. `abort_match` sends the escrow rent to the
  creator although the sponsor paid it (about 0.002 SOL per abandoned match).

## Sponsor allowlist (backend) as it relates to the program

`validateSponsoredTransaction` only sponsors listed discriminators and checks signer positions,
which is the right shape. Two notes: it accepts `initialize_match` with any arguments, so the fee
exploit in finding 1 was sponsor-funded until the program pins the wallet; and `close_match` is
sponsored with the sponsor as `payer`, which the program now rejects unless the sponsor key is a
player or the platform fee wallet. Either make the sponsor fee payer the platform fee wallet, or
wait for `rent_payer`.

## Review of the proposed changes

### Scheduled start times and "opponent never joined"

What exists today: `abort_match` lets the creator cancel while `WaitingForOpponent` and refunds the
stake and escrow rent. Nothing else ends an unjoined match, and the creator must sign.

Recommended program design (one upgrade, together with the fixes above):

- New fields on `ChessMatch`: `start_at: i64` (0 = immediate), `join_deadline: i64` (0 = none),
  `rent_payer: Pubkey`. `initialize_match` takes `start_at` and `join_deadline` as arguments and
  validates `now <= start_at <= now + 30 days` and `join_deadline >= start_at` (or a fixed grace,
  e.g. 15 minutes after `start_at`, and 24 hours for immediate matches).
- `join_match`: `require!(join_deadline == 0 || now <= join_deadline)`. Joining before `start_at`
  is allowed (that's the point of scheduling). Set `last_move_timestamp = max(now, start_at)` so
  White's clock starts at the scheduled time, not at the join.
- `make_move`: `require!(now >= start_at)` (`GameNotStarted`). The timeout check already uses
  `last_move_timestamp`, so nothing else changes. Note the rollup clock is used once delegated;
  it tracks the base clock closely.
- `abort_match`: keep the creator path at any time while waiting. Add a permissionless path:
  anyone may abort once `join_deadline != 0 && now > join_deadline`. The refund still goes to a
  token account owned by `players[0]` (constraint unchanged) and the escrow rent to `rent_payer`.
  The backend keeper (or the reconciler) then cleans up abandoned matches with the sponsor key.
- Free matches: the same, minus token accounts once the free-match path lands.

Without a program change the product can still ship most of it: store the start time and deadline
in Postgres (the sibling thread's plan), show "starts in…" in the lobby, hide expired matches, and
show the creator a "Cancel and get your stake back" button that calls today's `abort_match`. What
can't be done without the upgrade: a third party ending an abandoned match, and a clock that waits
for the start time (today White's clock starts at join, so a joiner at a scheduled match must move
immediately or the creator claims a timeout).

Layout change and migration: adding fields changes the account size. Anchor's deserialisation of an
old, shorter account fails, so every existing `ChessMatch` must be settled, aborted or closed before
the upgrade (the reconciler's sweep lists them; they are devnet test games), or the upgrade ships a
`migrate_match` instruction with `realloc`. Settling them first is less work. The unused
`active_task_id`, `current_player_idx` and `delegation_uid` fields could be repurposed to avoid the
layout change, but that trades a one-time cleanup for permanent confusion; don't.

### Permissionless `claim_timeout_win` and `undelegate_match` (backend keeper)

Safe as described in CLAUDE.md, with these conditions: the winner comes from `current_turn` and the
on-chain clock, never from the signer; `undelegate_match` stays player-only while `Active` and opens
to anyone only when the status is terminal; and finding 5 (delegate only when `Active`) ships in the
same upgrade, otherwise the keeper's settlement can be blocked by re-delegation. Add a
`GameEndedEvent` emitter path that the indexer already understands (it does; `claim_timeout_win`
emits it).

### Free-match path and `process_match_settlement.payer`

Agree with the plan in CLAUDE.md. Make the token accounts `Option<>` only when `bet_amount == 0`,
and close `chess_match` directly to `rent_payer` in a `settle_free_match` instruction. Pin `payer`
through `rent_payer` (finding 8) in the same upgrade.

### Magic Actions for automatic payout

No new security concern beyond the ones already noted in CLAUDE.md. The action calls
`process_match_settlement` unchanged; `payout_processed` and the escrow close make it idempotent.
Fund the action authority PDA's balance once and keep it undelegated. If the action fails the
"Finalize" button remains the fallback.

## Upgrade plan (one devnet deploy)

1. This PR's fixes (no layout change): fee pin and cap, prediction settle owners, cancel after
   settle, pool mint, delegate only when active, close by player or platform wallet.
2. Layout change: `start_at`, `join_deadline`, `rent_payer`. Settle or abort all existing devnet
   matches first.
3. Permissionless abort after deadline; permissionless `claim_timeout_win`/`undelegate_match` once
   terminal; `payer` → `rent_payer`; minimum move clock; remove the task-scheduler instructions;
   decide the no-winner prediction rule (finding 3) and the betting-window rule (finding 4).
4. Free-match path.
5. Regenerate the IDL (`sdk/src/idl/magic_chess.ts`), update the sponsor allowlist for the new
   account layouts, and bump `SPONSOR_COST_ESTIMATES` if account sizes change.
