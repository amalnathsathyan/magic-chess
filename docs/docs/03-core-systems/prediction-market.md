# Prediction Market — Design & Audit

Parimutuel prediction market for chess matches. Spectators bet on match outcome (White wins / Black wins / Draw).
Losing pool distributed proportionally to winners. Fully on-chain via Solana PDAs.

---

## Architecture

```
PredictionPool PDA          PredictionBet PDA (1 per bettor per pool)
├── match_id                ├── bettor: Pubkey
├── total_bet_on_white      ├── pool: Pubkey (PredictionPool)
├── total_bet_on_black      ├── amount: u64
├── total_bet_on_draw       ├── predicted_outcome: u8 (0=White, 1=Black, 2=Draw)
├── platform_fee_bps         ├── claimed: bool
├── settlement_processed     └── bump: u8
└── bump: u8

PredictionPoolVault (Token Account)
└── Owned by PredictionPool PDA — holds all spectator bets
```

### PDAs

| PDA | Seeds |
|-----|-------|
| `PredictionPool` | `["prediction_pool", match_id]` |
| `PredictionPoolVault` | `["prediction_pool_vault", prediction_pool.key]` |
| `PredictionBet` | `["prediction_bet", prediction_pool.key, bettor.key]` |

### Instructions (5 total)

| Instruction | Description | Caller |
|-------------|-------------|--------|
| `initialize_prediction_pool` | Create pool for match. Requires `prediction_enabled` on ChessMatch. | Any (payer) |
| `place_prediction_bet` | Bet on White(0) / Black(1) / Draw(2). Transfers from bettor to vault. | Spectator |
| `settle_prediction_pool` | Mark winning outcome after match ends. Reads `ChessMatch.game_status` as oracle. | Permissionless |
| `claim_prediction_winnings` | Winner pulls payout from vault. Pull model, not push. | Winning bettor |
| `cancel_prediction_bet` | Full refund if match aborted or never started. Closes PredictionBet account. | Bettor |

### Enablement

Per-match gating via `ChessMatch.prediction_enabled: bool`. Only matches created with this flag
can have a prediction pool initialized. Frontend already has toggle in `CreateMatchForm.tsx` (line 242-260).

---

## Payout Math (Parimutuel)

```
total_pool     = total_white + total_black + total_draw
winning_pool   = total_<winning_outcome>
losing_pool    = total_pool - winning_pool
platform_fee   = losing_pool * platform_fee_bps / 10000
winner_share   = winning_pool + losing_pool - platform_fee

individual_payout = (bettor_amount / winning_pool) * winner_share
```

Platform takes fee **only from losing pool**. Winners get their stake back + proportional share of loser funds (minus fee). Integer math with u128 intermediate to avoid overflow.

Implementation: `claim_prediction_winnings.rs` lines 83-124.

---

## Draw Handling — Full Audit

### Standard Chess Draw Conditions

| # | Condition | FIDE Rule | On-Chain | Prediction |
|---|-----------|-----------|----------|------------|
| 1 | Stalemate (no legal moves, not in check) | 5.2.1 | ✅ | ✅ outcome=2 |
| 2 | Insufficient material | 5.2.2 | ✅ | ✅ outcome=2 |
| 3 | Fifty-move rule (50 moves no pawn move/capture) | 9.3 | ✅ | ✅ outcome=2 |
| 4 | Threefold repetition | 9.2 | ✅ | ✅ outcome=2 |
| 5 | Mutual agreement | 5.2.3 | ❌ | ❌ |

### Engine Flow (chess_logic.rs)

After each move, `validate_and_apply_move` checks in this order:

1. **Checkmate/Stalemate** (line 185-196): Calls `are_no_legal_moves`. If no moves and in check → Checkmate. If no moves and not in check → Stalemate (`MoveResult::Stalemate`).
2. **Insufficient Material** (line 198-200): `is_insufficient_material` → K vs K, K+B vs K, K+N vs K, K+B vs K+B (same color). Returns `MoveResult::Stalemate`.
3. **Fifty-Move Rule** (line 202-204): `halfmove_clock >= 100` → `MoveResult::Stalemate`.
4. **Threefold Repetition** (line 206-208): FNV-1a Zobrist hash, 200-entry ring buffer in `position_history`. Returns `MoveResult::ThreefoldRepetition`.

`halfmove_clock` increments on each non-pawn, non-capture move; resets to 0 on pawn moves/captures (line 163-167).

### Make Move Handler (make_move.rs)

```
MoveResult::Stalemate           → GameStatus::Draw, end reason = Stalemate or FiftyMoveRule
MoveResult::ThreefoldRepetition → GameStatus::Draw, end reason = ThreefoldRepetition
MoveResult::Checkmate           → GameStatus::WhiteWins or BlackWins
MoveResult::Normal              → continue
```

Lines 132-160.

### Settlement (process_match_settlement.rs)

```
GameStatus::WhiteWins → process_payout(winner = player_one)
GameStatus::BlackWins → process_payout(winner = player_two)
GameStatus::Draw      → process_draw_payout(both players refunded)
```

Validates both players are non-default before draw payout (lines 128-141). Calls `process_draw_payout` from `payout_logic.rs`.

### Draw Payout (payout_logic.rs)

```
platform_fee = total_pot * platform_fee_bps / 10000
remaining    = total_pot - platform_fee
p1_refund    = remaining / 2                      // integer division
p2_refund    = remaining - p1_refund              // remainder → player 2
```

- Platform still takes fee on draws.
- Both players get approximately 50% back.
- If `total_pot` is odd, p2 gets 1 extra unit.

### Key Finding: No "Draw by Agreement" On-Chain

Frontend has "Draw" button in `BoardControls.tsx` (line 49-54) but handler is stubbed:
```
onOfferDraw={() => {}}   // play/[matchId]/page.tsx line 507
```

Standard FIDE chess allows mutual agreement draw. This is the one draw condition that
requires active player input (others are engine-detected automatically). Missing from
both `make_move.rs` and as a standalone instruction.

To add:
1. New instruction `agree_to_draw` — requires both player signatures
2. Sets `GameStatus::Draw`, `GameEndReason::DrawByAgreement` (new variant)
3. Or simpler: one player "offers", other "accepts" via existing move flow

### Key Finding: InsufficientMaterial Reason Conflated

`chess_logic.rs` returns `MoveResult::Stalemate` for insufficient material. `GameEndReason::InsufficientMaterial` is commented out in `enums.rs`:
```rust
// InsufficientMaterial, // Potentially later
```

Result: game ending by insufficient material shows `GameEndReason::Stalemate` in events. Minor data quality issue.

---

## Prediction Market — Draw Settlement

### Flow
1. Game ends with `GameStatus::Draw` (any draw condition)
2. `settle_prediction_pool` called → `settlement_processed = true`, winning outcome = 2
3. Bettors who predicted `outcome=2` (Draw) call `claim_prediction_winnings`
4. Same payout formula — `total_bet_on_draw` is the winning pool

### Edge Case: No Draw Bets
If `total_bet_on_draw == 0` when match ends in Draw:
- `settle_prediction_pool` still processes normally
- `claim_prediction_winnings` returns `NothingToClaim` for all bettors (winning pool is 0)
- Net effect: all bettors lose their wager, funds stay in vault
- **Problem**: Funds trapped in vault with no way to withdraw. Need a clawback or `claim_refund_on_no_winner` instruction. **This is a bug.**

### Edge Case: Cancel During Active Game
Not allowed. `cancel_prediction_bet` requires `WaitingForOpponent` or `Aborted` game status. Once game is `Active`, bets are locked.

---

## Frontend Status

### What Exists
- **CreateMatchForm**: Toggle to enable predictions (line 242-260)
- **Play page**: Prediction Market panel in right sidebar (line 530-551)
- **Two buttons**: White / Black with pool display
- **Pool amounts**: Hardcoded "0 SOL"

### What's Missing
1. **No Draw button** in prediction panel — only White/Black. On-chain has `total_bet_on_draw`.
2. **No data fetching** — pool totals not read from chain.
3. **No graph/chart** — no Polymarket-style bars, just 2 buttons.
4. **No bet placement modal** — buttons don't open anything.
5. **No SDK methods** — client.ts missing all 5 prediction instructions.

---

## Yes/No Graph — Polymarket-Style Design

### Recommended: Horizontal Probability Bars

```
┌──────────────────────────────────────────────────┐
│ White wins  ████████████████████  1,500 SOL 60%  │
│ Black wins  ██████████            750 SOL   30%  │
│ Draw        ████                  250 SOL   10%  │
└──────────────────────────────────────────────────┘
```

- Each bar width proportional to `total_bet_on_X / total_pool`
- Shows implied probability as percentage
- Clicking a bar opens bet placement modal
- Updates on new bets via WebSocket/polling
- Color coding: White = light, Black = dark, Draw = amber

### Data Source
All on `PredictionPool` account — public, no privacy concern for aggregates.

```
fetchPredictionPool(matchId) → {
  totalBetOnWhite: u64,
  totalBetOnBlack: u64,
  totalBetOnDraw: u64,
  settlementProcessed: bool,
}
```

### Component Tree
```
PredictionPanel
├── ProbabilityBars (Polymarket-style)
│   ├── Bar (white) — width: totalWhite/total × 100%
│   ├── Bar (black) — width: totalBlack/total × 100%
│   └── Bar (draw)  — width: totalDraw/total × 100%
├── MyBets (current user's bets in this pool)
└── BetModal (place new bet: amount + outcome selector)
```

---

## Amount Confidentiality — Case Study

### Question
Should individual bet amounts be confidential? Polymarket shows only aggregate pool totals.
If confidential, how to render graph?

### Current State
- `PredictionBet.amount: u64` is stored on-chain → **public by default**
- Anyone can scan all `PredictionBet` PDAs for a pool
- SDK `client.ts` can `getProgramAccounts` filtered by pool

### Analysis

| Concern | Assessment |
|---------|------------|
| **Whale front-running** | Low risk. Outcome is determined by chess game, not by bet size. No MEV from knowing someone bet big on White. |
| **Privacy** | Real concern for some users. But Solana = public ledger. Obfuscation is theater. |
| **Copy-trading** | Low-moderate. Someone could follow profitable bettors. Mitigation: don't show "who" in UI. |
| **Graph rendering** | **Not a conflict.** Graph uses aggregate totals (`total_bet_on_white`), not individual amounts. |
| **Math verifiability** | Public amounts = anyone can verify payouts. Good for trust. |
| **Protocol complexity** | Commit-reveal = 2 tx per bet + reveal window + slashing. Massive complexity for marginal gain. |

### Graph vs. Confidentiality — No Conflict

Graph data flow:
```
PredictionPool.total_bet_on_white  ──┐
PredictionPool.total_bet_on_black  ──┤──> Frontend bar chart
PredictionPool.total_bet_on_draw   ──┘    (WS subscription / polling)
```

Individual bet amounts **never enter the graph pipeline**. The bar chart only needs 3 numbers
from `PredictionPool`. Individual bets are separate PDAs.

### Recommendation: Don't Encrypt

1. **Graph works fine** with public aggregates (Polymarket model)
2. **UI layer confidentiality**: Frontend never shows "who bet what." Only pool totals.
3. **On-chain confidentiality is hard**: Commit-reveal adds 2 transactions, reveal window, slashing for non-reveal, and settlement delay. Not worth it.
4. **MagicBlock privacy (deferred)**: MagicBlock Ephemeral Rollups can keep `PredictionBet.amount` in private ER state during betting phase, then settle only aggregate totals (`total_bet_on_white/black/draw`) to L1 after game ends. Individual positions never touch L1. Technically feasible — the project already uses MagicBlock ER for gameplay state. But unwarranted complexity without real user demand. Skip for MVP; revisit if whales cite privacy as blocker.

### Polymarket Comparison

| Feature | Polymarket | Magic Chess |
|---------|------------|-------------|
| Market type | Binary (CTF tokens) | Parimutuel 3-outcome |
| Oracle | UMA optimistic oracle | On-chain game status (instant) |
| Fee model | 0% fees on Polygon | Platform fee BPS on losing pool only |
| Settlement | ~2h UMA challenge window | Instant after game ends |
| Graph | Yes/No bar with % | Not yet implemented |
| Individual positions | Private (off-chain orderbook) | Public on-chain PDAs |

---

## Bugs & TODOs

### Bugs

1. **[HIGH] Funds trapped if winning pool is 0**: If match ends in Draw but `total_bet_on_draw == 0`, all bets lose, funds stay in vault forever. No clawback instruction exists. Add `claim_refund_on_no_winner` or allow cancel after settlement if winning pool empty.

2. **[MEDIUM] Draw payout vulnerability**: `process_draw_payout` (lines 152-158) uses integer division for split. If `total_pot - fee` is odd, p2 gets 1 extra unit. Acceptable for most tokens but could matter for high-value tokens with few decimals.

3. **[LOW] InsufficientMaterial reason conflated**: Returns `GameEndReason::Stalemate` for insufficient material. `GameEndReason::InsufficientMaterial` commented out.

### TODOs

| Priority | Task | Location |
|----------|------|----------|
| P0 | Add Draw button to prediction panel | `frontend/app/play/[matchId]/page.tsx:540-549` |
| P0 | Wire pool totals from on-chain | `sdk/src/client.ts` + frontend hook |
| P1 | Build Polymarket-style bar chart | New component: `PredictionBars.tsx` |
| P1 | Add all 5 prediction methods to SDK client | `sdk/src/client.ts` |
| P1 | Add `agree_to_draw` instruction | New file: `instructions/agree_to_draw.rs` |
| P2 | Fix InsufficientMaterial GameEndReason | `chess_logic.rs` + `enums.rs` |
| P2 | Add clawback for no-winner pools | New instruction or modify `cancel_prediction_bet` |
| P3 | Add `GameStatus.Aborted` to SDK types | `sdk/src/types.ts` |