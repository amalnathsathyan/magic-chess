# Agent 15: Token Launch + Claim Drip

## Status: ✅ Complete — `TOKEN_STRATEGY.md` written

## Critical Finding: Fair-Launch Platforms CANNOT Reserve Supply

Neither pump.fun, Bags.fm, nor Moonshot allows creators to reserve token supply. All use fair-launch where 100% goes to bonding curve.

## Recommended: Manual SPL Token Creation

Create SPL token via CLI/Metaplex, mint 1B supply, distribute manually.

### Token: $SPEED
- Total supply: 1,000,000,000 (1B)
- Decimals: 9
- 60% Dev wallet (600M — claim drips)
- 15% LP (150M — Raydium CPMM pool)
- 15% Treasury (150M — buyback reserves)
- 10% Marketing (100M — community/airdrops)
- Launch cost: ~$500-1000 in SOL + SPEED for initial liquidity

### Claim Drip Mechanism

**New PDAs**:
- `PlayerStats` PDA `[b"player_stats", wallet]` — tracks `games_played`
- `RewardClaim` PDA `[b"reward_claim", wallet]` — one claim per wallet
- `ClaimCounter` PDA `[b"claim_counter"]` — global count for tier calc

**Progressive Claim Amounts**:
| Claims | Amount per claim | Total pool |
|--------|-----------------|------------|
| First 1,000 | 10,000 SPEED | 10M |
| Next 5,000 | 5,000 SPEED | 25M |
| Next 20,000 | 1,000 SPEED | 20M |
| Remaining | 500 SPEED | ~273M |

**Backend relay signs claims** (dev wallet keypair on server) → users never pay gas.

**Sybil resistance**: Must complete a game (costs USDC stake), one claim per wallet, progressive amounts reward early adopters.

### Platform Comparison

| Feature | pump.fun | Bags.fm | Manual SPL |
|---------|----------|---------|------------|
| Reserve supply | ❌ | ❌ | ✅ |
| DEX liquidity | Auto (Raydium) | Auto | Manual (1 tx) |
| Creator fees | During bonding curve only | During bonding curve only | N/A |
| Cost | ~0.02 SOL | ~0.02 SOL | ~0.41 SOL |
| Control | Low | Low | **Full** |
