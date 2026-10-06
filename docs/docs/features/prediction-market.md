# Prediction market (on-chain)

Spectators can stake tokens on a match's result: White wins, Black wins or Draw. The pool is parimutuel: correct predictors split most of the losing side's stakes. All of it runs on L1 through PDAs owned by the program.

:::info Status
The program instructions and SDK methods are live on devnet. ZUG Arena does not show an outcome-pool UI yet. In the app, spectators use the points-based [live move predictions](./move-predictions.md) instead.
:::

## Accounts

| Account | Seeds | Holds |
|---------|-------|-------|
| `PredictionPool` | `["prediction_pool", match_id]` | Totals per outcome, `settlement_processed` and the bump |
| Pool vault (token account) | `["prediction_pool_vault", pool]` | All stakes; its authority is the pool PDA |
| `PredictionBet` | `["prediction_bet", pool, bettor]` | One bet per bettor per pool: amount, outcome (0 White, 1 Black, 2 Draw), `claimed` |

A pool can only exist for matches created with `prediction_enabled = true`.

## Instructions

| Instruction | Who | Rules |
|-------------|-----|-------|
| `initialize_prediction_pool` | Anyone (pays rent) | The match must have `prediction_enabled` |
| `place_prediction_bet` | Spectators | Only while the match is `Active` and the pool isn't settled. The two players can't bet. Stakes use the match's mint. |
| `settle_prediction_pool` | Anyone | Once the match is `WhiteWins`, `BlackWins` or `Draw`. Reads the result from `ChessMatch` and pays the players' and platform shares. |
| `claim_prediction_winnings` | Correct predictors | Pull-based: each winner claims their own payout |
| `cancel_prediction_bet` | Bettor | Full refund while the match waits for an opponent, after an abort, or when nobody backed the actual result |

## Payout math

`losing_pool` is the total staked on the outcomes that did not happen. At settlement it is split as follows:

| Share of `losing_pool` | Goes to |
|------------------------|---------|
| 75% | Correct predictors, pro rata, on top of their own stake |
| 10% | Match winner |
| 5% | Match loser |
| 10% | Platform fee wallet |

On a draw, the two players split the 15% player share equally (7.5% each).

```
payout = stake + stake × (75% × losing_pool) / winning_pool
```

Math uses `u128` intermediates and checked arithmetic. The constants are in `programs/magic_chess/src/constants.rs` (`PREDICTION_*_SHARE_BPS`). The pool's `platform_fee_bps` field is stored but does not change the split.

**Nobody picked the result.** If the winning side has no stakes, settlement splits the whole pool:

- 50% to the match winner
- 25% to the loser
- 25% to the platform

On a draw, the two players split their 75% equally. Settlement empties the vault, so no funds are trapped. Bettors who cancel before anyone settles get their stake back instead.

**Everyone picked the result.** If the losing pool is empty, each winner gets their stake back.

## SDK

```typescript
await client.initializePredictionPool(matchId, 0);
await client.placePredictionBet(matchId, 2 /* Draw */, 5_000_000n, myAta);
// after the game ends and someone calls settle_prediction_pool:
await client.claimPredictionWinnings(matchId, myAta);
```

The SDK has no wrapper for `settle_prediction_pool`; call it through `client.program.methods.settlePredictionPool()`.

Older design and audit notes for this feature are in `research/prediction-market-audit-2026-08.md`.
