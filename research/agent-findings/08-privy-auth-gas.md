# Agent 8: Privy/Auth Research + Gas Sponsorship

## Status: ✅ Complete — No code changes

## Winner: Privy

Explicitly recommended by MagicBlock. Battle-tested by Pump.fun, Jupiter, Tensor.

### Comparison Matrix

| Feature | Privy | Web3Auth | Dynamic | Magic.link |
|---------|-------|----------|---------|------------|
| Email/social login | ✅ | ✅ | ✅ | ✅ |
| Embedded Solana wallet | ✅ | ✅ | ✅ | ✅ |
| React Native | ✅ (Expo) | ✅ | ✅ | ✅ |
| **Session keys** | ✅ **TEE** | ❌ | ✅ (AA) | ❌ |
| **Gas sponsorship** | ✅ (server) | ❌ | ✅ (built-in) | ❌ |
| **MagicBlock compat** | ✅ **Explicit** | Listed | Likely | ❌ |
| Solana production use | Pump.fun, Jupiter | MetaMask | Loop Crypto | Unknown |
| Starting price | Free tier | Free (1K MAU) | Free (1K MAU) | Free (1K MAU) |

### Runner-up: Dynamic.xyz
Better SVM gas sponsorship docs, but $249/mo entry and no explicit MagicBlock integration.

## End-to-End UX Flow

```
1. User visits app → "Sign in with Google" (Privy UI)
2. Embedded Solana wallet auto-created (no seed phrase)
3. "Buy with Card" → MoonPay widget → USDC in wallet (~30s)
4. Create/Join match → ONE wallet confirmation
5. Chess moves → ZERO confirmations (Privy Delegated Actions TEE)
6. Game ends → auto-settlement, USDC in winner's wallet
```

## Gas Fee Model

| Action | Who Pays | Cost |
|--------|----------|------|
| Match creation (L1 delegation) | Platform sponsors | ~$0.001 |
| All chess moves (ER) | **FREE** | $0 |
| State commits (first 10) | **FREE** | $0 |
| Session close | Platform sponsors | ~$0.06 |
| **Total per match** | Platform | **~$0.06-0.16** |

## Onramp: MoonPay
- Tightest Privy + Solana App Kit integration
- Apple Pay / Google Pay support
- Transak as fallback (Lite KYC = faster onboarding)

## Cost Sustainability
At $5 average bet with 2% platform fee: $0.10 revenue per match.
At 100 matches/day: $10 revenue vs $8-16 costs = break-even.
At 1000 matches/day: $100 revenue vs $80-160 costs = small profit.
