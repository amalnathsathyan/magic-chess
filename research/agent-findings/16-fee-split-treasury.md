# Agent 16: Platform Fee Split + Treasury

## Status: ✅ Complete — `FEE_SPLIT_DESIGN.md` written

## Architecture: PDA-Controlled Treasury Vault

50% platform fees → Treasury Vault PDA (buyback fund)
50% platform fees → Developer Wallet (your wallet)

### New Accounts

**PlatformConfig** (global, one per program):
```rust
#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,             // Can update config
    pub developer_fee_wallet: Pubkey,  // 50% recipient
    pub fee_split_bps: u16,            // 5000 = 50/50
    pub default_platform_fee_bps: u16, // 200 = 2%
    pub bump: u8,
}
// PDA: [b"platform_config"]
```

**TreasuryVault** (per mint):
```rust
#[account]
pub struct TreasuryVault {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub total_fees_collected: u64,
    pub total_buybacks_executed: u64,
    pub bump: u8,
}
// PDA: [b"treasury_vault", token_mint.as_ref()]
```

### Fee Split Logic (in payout_logic.rs)
```rust
let treasury_share = fee
    .checked_mul(platform_config.fee_split_bps.into())
    .ok_or(ChessError::MathError)?
    .checked_div(10000)
    .ok_or(ChessError::MathError)?;

let developer_share = fee
    .checked_sub(treasury_share)
    .ok_or(ChessError::MathError)?;

// Two transfers instead of one
token::transfer(..., treasury_vault_ata, treasury_share)?;
token::transfer(..., developer_wallet_ata, developer_share)?;
```

### Buyback Mechanism
**MVP**: Manual withdrawal from treasury by authority → off-chain DEX swap → burn bought tokens.
**Stretch**: CPI to Jupiter for on-chain automated buyback.

### New Instructions
1. `initialize_platform_config` — One-time setup
2. `update_platform_config` — Change fee split, dev wallet (authority only)
3. `withdraw_treasury` — Manual buyback withdrawal (authority only)
4. `execute_buyback` — Automated Jupiter CPI (stretch goal)

### Developer Wallet Revenue
- 50% of platform fees from every match
- Token launch: 60% of $SPEED supply
- Prediction market fees (future)
- Total: ~$0.05/match in platform fees + token appreciation from buyback pressure

### Files: 10 modified, 3 new
