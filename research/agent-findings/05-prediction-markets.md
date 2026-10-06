# Agent 5: Prediction Market Extensibility

## Status: ✅ Complete — No code changes

## Architecture: Option C — PredictionPool PDA per Match

Extends the existing program with opt-in prediction pools. Clean separation, no cross-program complexity.

### What Changes NOW (1 byte)
Add to `ChessMatch`:
```rust
pub prediction_enabled: bool,  // gates prediction features per match
```

### No Changes To
- `join_match`, `make_move`, `resign_game`, `claim_timeout_win`
- `process_match_settlement` (prediction settlement is separate instruction)
- All chess logic files

### New Instructions (5 total — implement post-MVP)
1. `initialize_prediction_pool` — create PredictionPool PDA per match
2. `place_prediction_bet` — spectator bets on White/Black/Draw
3. `settle_prediction_pool` — trigger settlement after game ends
4. `claim_prediction_winnings` — winners claim (pull model)
5. `cancel_prediction_bet` — refund if match never starts

### New State
```rust
pub struct PredictionPool {
    pub match_id: String,
    pub total_bet_on_white: u64,
    pub total_bet_on_black: u64,
    pub total_bet_on_draw: u64,
    pub platform_fee_bps: u16,
    pub settlement_processed: bool,
    pub bettor_records: Vec<SpectatorBet>,
}
```

### Key Security Rules
- Players CANNOT bet (prevent throwing games)
- Bets locked once Active (no betting after game starts)
- Pull-model for claims (avoid CU limits from distributing to all winners)
- Oracle = on-chain game result (no external dependency)

### Attack Vectors Mitigated
| Attack | Mitigation |
|--------|-----------|
| Player bets against self | Hard block: `bettor != players[0] && bettor != players[1]` |
| Late betting (after game end) | Check `game_status == Active` |
| Double claim | `claimed: bool` on bettor record |
| Match abandoned | `cancel_prediction_bet` while WaitingForOpponent |

### Reference
LaChance-Lab Web3 Prediction Market — same parimutuel pool pattern on Anchor.

## Implementation Status: ✅ Phase 1 Complete

- `prediction_enabled: bool` added to `ChessMatch` state (1 byte)
- Default: `false` — no existing behavior changed
- Prediction pool instructions (5 total) deferred to post-MVP
