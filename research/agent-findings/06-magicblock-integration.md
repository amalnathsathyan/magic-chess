# Agent 6: MagicBlock Ephemeral Rollup Integration

## Status: ✅ Complete — No code changes

## Critical: Anchor Must Upgrade to 0.32.1

`ephemeral-rollups-sdk` v0.6.5 requires Anchor 0.32.1. Current project is on 0.31.1.

## Dependencies to Add
```toml
# Cargo.toml
ephemeral-rollups-sdk = { version = "0.6.5", features = ["anchor"] }
bincode = "1.3.3"
```

```bash
# npm
npm install @magicblock-labs/ephemeral-rollups-kit
```

## Key Program Addresses
| Program | Address |
|---------|---------|
| Delegation | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Task Scheduler | `Magic11111111111111111111111111111111111111` |
| Session Keys | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |

## Architecture Changes

### Required Macro
```rust
#[ephemeral]  // Auto-injects undelegation callback
#[program]
pub mod speed_chess { ... }
```

### Session Key Flow
1. User connects wallet → signs ONCE for delegation
2. Browser generates ephemeral Ed25519 keypair (IndexedDB)
3. All moves signed by session key (no wallet popups)
4. Scoped: only `make_move`, `resign_game` allowed
5. Revoked on match end or expiry

### Crank Chain (Auto-Settlement)
```
make_move → schedule timeout_check at now + timeout
  → Player 2 moves → cancel old task → schedule new task
  → Timeout expires → crank executes claim_timeout_win
    → Inside claim handler: schedule process_match_settlement
      → Crank executes settlement (payouts)
        → Inside settlement handler: schedule undelegate_match
          → Crank commits state to Solana L1
```

### Gas Model
| Action | Cost |
|--------|------|
| ER base transactions | FREE |
| Session close fee | 0.0003 SOL (~$0.06) |
| State commit fee | 0.0001 SOL (~$0.02) |
| Per match total | ~$0.06-0.16 |

### New Files (7 create, 9 modify)
**Create**: delegate_match.rs, commit_state.rs, undelegate_match.rs, schedule_timeout.rs, cancel_timeout_task.rs, match_session.rs, timeout_task.rs
**Modify**: Cargo.toml, Anchor.toml, lib.rs, instructions/mod.rs, make_move.rs, claim_timeout_win.rs, process_match_settlement.rs, state/mod.rs, chess_match.rs

### Timeline: 14-20 days for full integration

### Validator Endpoints (Devnet)
| Region | Endpoint |
|--------|----------|
| US | `https://devnet-us.magicblock.app` |
| EU | `https://devnet-eu.magicblock.app` |
| Asia | `https://devnet-as.magicblock.app` |
