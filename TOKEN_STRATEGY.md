# Magic Speed Chess -- Token Strategy & Claim Mechanism

## Part A: Token Launch Platform Comparison

### Critical Finding: Fair-Launch Constraint

After researching the three major Solana token launch platforms (pump.fun, Bags.fm, and Moonshot), a critical constraint emerged: **none of them allow the creator to reserve a percentage of token supply.** All three use fair-launch models where 100% of tokens enter the bonding curve and are available for public purchase from the start.

This means the original design goal -- "60% of supply goes to developer wallet" -- is **not achievable through any launchpad platform alone.** The strategy must be revised.

### Platform-by-Platform Research

#### pump.fun

| Aspect | Detail |
|--------|--------|
| **Launch mechanism** | Bonding curve (constant product x*y=k). All 1B tokens enter the curve. At ~$69K-$90K market cap, the token "graduates" to PumpSwap (formerly Raydium) |
| **Creator allocation** | **None.** 0% reserved. Creators earn 0.30% of bonding curve trades + 0.5 SOL at graduation |
| **Platform fee** | 1.25% per trade (0.95% protocol, 0.30% creator) on bonding curve; ~0.25% on PumpSwap |
| **Token creation cost** | Free (covered by first buyer; was ~$2 previously) |
| **Token type** | Standard SPL token |
| **Maturity** | Market leader. 67.9% Solana market share. $800M+ lifetime revenue. 11.8M+ tokens launched |
| **Graduation rate** | Only ~1-1.5% of tokens ever graduate to DEX |
| **Key limitation** | No way to reserve supply. The bonding curve owns all tokens during launch phase |

#### Bags.fm

| Aspect | Detail |
|--------|--------|
| **Launch mechanism** | Mobile-first fair launch. Tokens trade from creation. Meteora DAMM v2 on graduation |
| **Creator allocation** | **None reserved.** Creators earn perpetual royalties (1% of trading volume) + fee splitting |
| **Platform fee** | 1% per trade. Creators can split fees across up to 100 wallets via basis points |
| **Token creation cost** | ~0.02-0.03 SOL (some integrations make it free) |
| **Token type** | Standard SPL token |
| **Maturity** | Launched May 2025. ~11.6% market share. $1B+ in 30-day volume. Growing fast |
| **Unique features** | Mobile-first app, Apple Pay deposits, integrated group chat, AI agent integration, fee-splitting by identity (Twitter, GitHub, email, etc.) |
| **Key limitation** | No reserve/vesting. Fair launch only. No third-party audits or public whitepaper |
| **Risk factors** | Smaller user base. Heavy reliance on founder. No smart contract audits. Some reports of withdrawal issues |

#### Moonshot (by Dexscreener) -- Reference Only

| Aspect | Detail |
|--------|--------|
| **Supply control** | Fixed 1B supply. 150M-200M burned at migration. No creator allocation |
| **Threshold** | 500 SOL market cap (~$64K-$68K) for Raydium migration |
| **Audience** | Dexscreener ecosystem users |

### Head-to-Head Comparison

| Feature | pump.fun | Bags.fm |
|---------|----------|---------|
| Market share | 67.9% | 11.6% |
| Daily tokens launched | ~23,640 | ~451 |
| Daily volume | ~$160M | ~$512K |
| Platform | Web-based | Mobile-first app |
| Creator royalties | Yes (via PumpSwap) | Yes (perpetual, 1% volume) |
| Fiat on-ramp | No | Apple Pay, Coinbase |
| Social features | Live streaming | Integrated group chat |
| Audits | Established, audited | No audits, no whitepaper |
| **Creator supply reserve** | **Not possible** | **Not possible** |

### Recommendation: Manual SPL Token Creation

Neither pump.fun nor Bags.fm meets our core requirement: **reserving 60% of supply in a developer wallet for game-completion claims.** Both platforms are designed for memecoin speculation, not for utility-token distribution models.

**Recommended approach: Manual SPL token creation**, then list on a DEX.

#### Why Manual SPL Creation?

1. **Full supply control:** Mint total supply, send 60% to developer wallet, use remainder for DEX liquidity and treasury
2. **Standard SPL token:** Fully compatible with our Anchor program's token transfer operations (uses `anchor_spl::token::transfer` which works with any SPL token)
3. **No platform constraints:** No bonding curve, no automatic migration, no forced fair-launch mechanics
4. **Approximate cost:** ~0.41 SOL total (token creation ~0.001 SOL, metadata ~0.005 SOL, Raydium CPMM pool ~0.2-0.3 SOL, OpenBook market not needed for CPMM)
5. **DEX listing:** Create a Raydium CPMM pool manually (cheaper than AMM V4, no OpenBook market required, supports Token-2022 if needed)

#### Optional: Hybrid Bootstrapping

If community awareness and initial trading volume are priorities, a hybrid approach is possible:
1. Create a small "marketing allocation" (e.g., 2-5% of supply) and launch it on Bags.fm for exposure
2. The main 60% developer wallet allocation remains separate and controlled
3. This is complex and likely not worth the overhead for a hackathon project

---

## Part B: Tokenomics Design

### Token Name & Identity

**Recommended: $SPEED** (Speed Chess token)

Runner-up: $MATE (Checkmate). Both are short, memorable, and directly tied to the product. $MAGIC risks confusion with Magic Eden/MagicBlock's own branding and should be avoided.

### Token Supply

```
Total Supply: 1,000,000,000 SPEED (1 billion, 9 decimals)
```

| Allocation | Percentage | Amount | Purpose |
|------------|-----------|--------|---------|
| Developer wallet (claim drip) | 60% | 600,000,000 | Game-completion claims, one per wallet |
| Liquidity pool (Raydium CPMM) | 15% | 150,000,000 | Paired with SOL/USDC for DEX trading |
| Treasury / buyback reserve | 15% | 150,000,000 | Future staking rewards, fee buybacks, burns |
| Marketing / community airdrops | 10% | 100,000,000 | Early adopter bonuses, tournament prizes |

### Token Utility

The token provides utility within the Magic Speed Chess ecosystem:

| Utility | Mechanism | Status |
|---------|-----------|--------|
| **Gas fee sponsorship** | Burn 1 SPEED per game to cover MagicBlock delegation/commit/session fees | Phase 3 (post-hackathon) |
| **Platform fee discount** | Hold >= 10,000 SPEED = 50% off platform fee | Phase 3 |
| **Cosmetic upgrades** | Spend SPEED for custom board themes, badges | Phase 3 |
| **Staking** | Stake SPEED to earn share of platform fees | Phase 4 (future) |
| **Governance** | DAO voting on fee parameters, token utility changes | Phase 4 (future) |

### Developer Wallet Setup

1. **Generate a dedicated keypair** -- stored securely, NOT in source code
2. Use a `.env` file (gitignored) or hardware wallet for production
3. After token minting, the developer wallet receives the 60% supply directly into its Associated Token Account (ATA)
4. The claim instruction verifies the dev wallet's ATA has sufficient balance

```bash
# Example: Creating the developer wallet ATA
spl-token create-account <TOKEN_MINT_ADDRESS> --owner <DEV_WALLET_PUBKEY>
# Then send 600M tokens to this ATA
spl-token transfer <TOKEN_MINT_ADDRESS> 600000000000000000 <DEV_WALLET_ATA> --allow-unfunded-recipient --fund-recipient
```

---

## Part C: Game-Completion Claim Mechanism

### Design Overview

The claim mechanism is an on-chain Anchor instruction that:
1. Verifies the claimer has completed at least one game
2. Ensures one claim per wallet (sybil resistance)
3. Transfers tokens from the developer wallet to the claimer
4. Records the claim on-chain

### On-Chain Verification of Game Completion

**Approach: New `PlayerStats` PDA account.**

Currently, the program has no player-tracking account. A `ChessMatch` only stores the two player pubkeys and the game outcome. We need a persistent record that a wallet has completed a game.

```rust
#[account]
#[derive(InitSpace, Debug)]
pub struct PlayerStats {
    pub wallet: Pubkey,
    pub games_played: u32,
    pub games_won: u32,
    pub games_lost: u32,
    pub games_drawn: u32,
    pub total_wagered: u64,   // lifetime USDC/SOL wagered
    pub total_earned: u64,    // lifetime winnings
    pub has_claimed_reward: bool,
    pub bump: u8,
}
// PDA: [b"player_stats", wallet.as_ref()]
```

This account is created/updated during `process_match_settlement` for both players. It serves double duty: game completion tracking AND player profile for the frontend.

### Reward Claim PDA

```rust
#[account]
#[derive(InitSpace, Debug)]
pub struct RewardClaim {
    pub wallet: Pubkey,      // The wallet that claimed
    pub claimed_at: i64,     // Unix timestamp
    pub amount: u64,         // Amount claimed (in raw token units)
    pub bump: u8,
}
// PDA: [b"reward_claim", wallet.as_ref()]
```

The existence of this PDA alone proves the wallet has claimed -- no separate `bool` field needed on `PlayerStats`.

### Claim Tiers (Anti-Sybil: Progressive Amounts)

To incentivize early adoption and make front-running economically irrational:

| Tier | Claim Range | Amount per Claim | Total Distributed |
|------|------------|-----------------|-------------------|
| Early Adopter | First 1,000 claims | 10,000 SPEED | 10,000,000 |
| Growth | Next 5,000 claims | 5,000 SPEED | 25,000,000 |
| Standard | Next 20,000 claims | 1,000 SPEED | 20,000,000 |
| Late | Remaining claims | 500 SPEED | Up to 545,000,000 |

The tier is determined by a **global claim counter** stored in a separate PDA:

```rust
#[account]
#[derive(InitSpace, Debug)]
pub struct ClaimCounter {
    pub total_claims: u64,
    pub total_distributed: u64,
    pub bump: u8,
}
// PDA: [b"claim_counter"]
```

### Anchor Instruction: `claim_game_reward`

```rust
// ---- Context ----
#[derive(Accounts)]
pub struct ClaimGameReward<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    // Player stats: must exist, games_played > 0
    #[account(
        seeds = [b"player_stats", claimer.key().as_ref()],
        bump = player_stats.bump,
        constraint = player_stats.games_played > 0 @ ChessError::NoGamesPlayed,
    )]
    pub player_stats: Account<'info, PlayerStats>,

    // Reward claim PDA: init = first claim, otherwise constraint fails
    #[account(
        init,
        payer = claimer,
        space = 8 + RewardClaim::INIT_SPACE,
        seeds = [b"reward_claim", claimer.key().as_ref()],
        bump,
    )]
    pub reward_claim: Account<'info, RewardClaim>,

    // Global claim counter
    #[account(
        mut,
        seeds = [b"claim_counter"],
        bump = claim_counter.bump,
    )]
    pub claim_counter: Account<'info, ClaimCounter>,

    // Developer wallet ATA (the source of reward tokens)
    #[account(
        mut,
        constraint = dev_wallet_ata.mint == token_mint.key()
            @ ChessError::InvalidTokenMint,
    )]
    pub dev_wallet_ata: Account<'info, TokenAccount>,

    // Claimer's ATA for the reward token
    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = token_mint,
        associated_token::authority = claimer,
    )]
    pub claimer_token_ata: Account<'info, TokenAccount>,

    // The token mint (verified against a stored config or hardcoded)
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---- Handler ----
pub fn claim_game_reward(ctx: Context<ClaimGameReward>) -> Result<()> {
    let claimer = ctx.accounts.claimer.key();
    let player_stats = &ctx.accounts.player_stats;
    let claim_counter = &mut ctx.accounts.claim_counter;

    // 1. Verify player has completed at least 1 game (constraint above handles this)

    // 2. Determine claim amount based on current tier
    let claim_amount = determine_claim_amount(claim_counter.total_claims);
    require!(claim_amount > 0, ChessError::ClaimPoolExhausted);

    // 3. Verify dev wallet has sufficient balance
    require!(
        ctx.accounts.dev_wallet_ata.amount >= claim_amount,
        ChessError::InsufficientDevWalletBalance
    );

    // 4. Derive dev wallet PDA signer
    //    The dev wallet ATA is a standard ATA (not a PDA).
    //    The dev wallet keypair must sign this transaction.
    //    For gasless UX, use a relay server that holds the dev wallet keypair.
    //
    //    ALTERNATIVE: Use a PDA as the dev wallet, with seeds [b"dev_wallet"]:
    //    let dev_wallet_seeds = &[b"dev_wallet", &[dev_wallet_bump]];
    //    let signer_seeds = &[&dev_wallet_seeds[..]];
    //
    //    But that requires the PDA to be the ATA authority, which
    //    complicates token management. For hackathon, use a relay server.

    // 5. Transfer tokens from dev wallet ATA to claimer ATA
    //    NOTE: This requires the dev_wallet to sign.
    //    In practice, use a relay/backend wallet that holds the dev keypair.
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.dev_wallet_ata.to_account_info(),
                to: ctx.accounts.claimer_token_ata.to_account_info(),
                authority: ctx.accounts.dev_wallet_signer.to_account_info(),
            },
        ),
        claim_amount,
    )?;

    // 6. Record the claim
    let clock = Clock::get()?;
    ctx.accounts.reward_claim.set_inner(RewardClaim {
        wallet: claimer,
        claimed_at: clock.unix_timestamp,
        amount: claim_amount,
        bump: ctx.bumps.reward_claim,
    });

    // 7. Update claim counter
    claim_counter.total_claims = claim_counter
        .total_claims
        .checked_add(1)
        .ok_or(ChessError::ArithmeticOverflow)?;
    claim_counter.total_distributed = claim_counter
        .total_distributed
        .checked_add(claim_amount)
        .ok_or(ChessError::ArithmeticOverflow)?;

    // 8. Emit event
    emit!(RewardClaimedEvent {
        wallet: claimer,
        amount: claim_amount,
        total_claims: claim_counter.total_claims,
    });

    Ok(())
}

// ---- Helper ----
fn determine_claim_amount(total_claims: u64) -> u64 {
    match total_claims {
        0..=999 => 10_000 * 10u64.pow(9),       // 10,000 SPEED with 9 decimals
        1000..=5999 => 5_000 * 10u64.pow(9),     // 5,000 SPEED
        6000..=25999 => 1_000 * 10u64.pow(9),    // 1,000 SPEED
        _ => 500 * 10u64.pow(9),                  // 500 SPEED
    }
}
```

### How the Dev Wallet Signs for Transfers

The claim instruction requires the developer wallet to sign as the `authority` of the token transfer `from` account. Options:

| Method | UX | Complexity | Security |
|--------|----|-----------|----------|
| **A. User pays dev wallet as fee payer + dev signs** | Worst (user needs SOL anyway) | Low | Medium (dev key online) |
| **B. Backend relay server** | Good (user signs claim instruction, relay wraps and pays) | Medium | Requires server with key management |
| **C. PDA as dev wallet authority** | Best (no server needed) | Higher | Best (on-chain authority) |

**Recommended for hackathon: Option B (Backend relay server).**

The backend holds the dev wallet keypair in an environment variable. When a user requests a claim, the backend:
1. Builds the `claim_game_reward` transaction
2. Adds the dev wallet as an additional signer
3. Signs and submits to Solana
4. The frontend shows "Claim submitted" -- user never pays gas

For production, migrate to Option C (PDA dev wallet), where the dev wallet ATA is owned by a PDA `[b"dev_wallet"]`. This eliminates the server dependency.

### PDA Seed Summary (New Additions)

| PDA | Seeds | Purpose |
|-----|-------|---------|
| `PlayerStats` | `[b"player_stats", wallet.as_ref()]` | Per-player lifetime statistics + claim gate |
| `RewardClaim` | `[b"reward_claim", wallet.as_ref()]` | One-per-wallet claim proof |
| `ClaimCounter` | `[b"claim_counter"]` | Global singleton tracking total claims |

These follow the existing program pattern: `[b"prefix", identifier]` with bump stored in the account.

### Sybil Resistance Strategy

| Layer | Mechanism | Effectiveness |
|-------|-----------|---------------|
| **Economic** | Must complete a game (requires staking + finding opponent + playing) | High -- each game has real economic cost |
| **Identity** | One claim per wallet (PDA-enforced) | Medium -- attackers can create many wallets |
| **Progressive amounts** | Early claims get more, but you need to play first | Deters front-running (can't claim without playing) |
| **Optional: Minimum bet** | Require >= $1 USDC wagered on completed game | Adds minimum cost per claim wallet |

For additional protection, integrate Proof of Human (`verify-humanity-poh` skill available) to gate claims behind human verification.

---

## Part D: PlayerStats Integration (How to Track Game Completion)

### Modified `process_match_settlement`

The existing `process_match_settlement` instruction must be extended to create/update `PlayerStats` for both players. This is the single point where a game is conclusively recorded as "completed."

```rust
// Inside process_match_settlement handler, after payout logic:

// Update Player 1 stats
update_player_stats(
    &mut ctx.accounts.player_one_stats,
    ctx.accounts.player_one_signer.key(),
    game_status,  // WhiteWins, BlackWins, or Draw
    PlayerColor::White,
    &ctx.accounts.chess_match,
    &ctx.accounts.system_program,
    ctx.bumps.player_one_stats,
)?;

// Update Player 2 stats
update_player_stats(
    &mut ctx.accounts.player_two_stats,
    ctx.accounts.player_two_signer.key(),  // NOTE: player_two is not a signer in settlement
    game_status,
    PlayerColor::Black,
    &ctx.accounts.chess_match,
    &ctx.accounts.system_program,
    ctx.bumps.player_two_stats,
)?;

// Helper:
fn update_player_stats(
    stats: &mut Account<PlayerStats>,
    wallet: Pubkey,
    game_status: GameStatus,
    player_color: PlayerColor,
    chess_match: &ChessMatch,
) -> Result<()> {
    stats.games_played = stats.games_played.checked_add(1).ok_or(...)?;

    let won = match (game_status, player_color) {
        (GameStatus::WhiteWins, PlayerColor::White) => true,
        (GameStatus::BlackWins, PlayerColor::Black) => true,
        _ => false,
    };
    let drawn = matches!(game_status, GameStatus::Draw);

    if won { stats.games_won += 1; }
    else if drawn { stats.games_drawn += 1; }
    else { stats.games_lost += 1; }

    // Track wagered/earned amounts
    let wagered = if player_color == PlayerColor::White {
        chess_match.bet_amount_player_one
    } else {
        chess_match.bet_amount_player_two
    };
    stats.total_wagered = stats.total_wagered.checked_add(wagered).ok_or(...)?;

    Ok(())
}
```

**Note on player_two not signing:** In `process_match_settlement`, `player_two` is not a signer (only payer signs). The `PlayerStats` PDA for player_two can still be initialized because the system program doesn't require the beneficiary to sign for account creation -- only the payer (any signer) needs to sign. This is standard Anchor behavior for `init` accounts.

---

## Part E: Self-Sustaining Tokenomics

### Cost Structure Per Match

| Cost Item | Amount | Covered By |
|-----------|--------|-----------|
| MagicBlock delegation fees | ~$0.001/match | Platform fee |
| MagicBlock commit fees | ~$0.02 (10 commits per game) | Platform fee |
| MagicBlock session close | ~$0.06/match | Platform fee |
| Helius webhooks | Free (free tier) | N/A |
| Hosting (Railway/Vercel) | Free (free tier) | N/A |
| **Total per match** | **~$0.08-$0.16** | Platform fee |

### Revenue per Match

At 2% platform fee:
- $5 bet: $0.10 revenue per match
- $10 bet: $0.20 revenue per match
- $20 bet: $0.40 revenue per match

**Break-even:** ~$4 average bet at 2% fee covers costs.

### Volume Projections

| Matches/Day | Revenue (at $5 avg bet) | Costs | Profit/Loss |
|-------------|------------------------|-------|-------------|
| 10 | $1.00 | $0.80-$1.60 | ~$0 (breakeven) |
| 100 | $10.00 | $8-16 | ~$0 (breakeven) |
| 1,000 | $100.00 | $80-160 | Small profit |
| 10,000 | $1,000.00 | $800-1,600 | Profit |

### Sustainability Levers

| Lever | Mechanism | Impact |
|-------|-----------|--------|
| **Increase platform fee** | 2% -> 3% on bets < $10 | +50% revenue on small games |
| **Token buyback** | 50% of platform fees buy SPEED from market, redistribute to stakers | Creates buy pressure, rewards holders |
| **Premium features** | Tournaments with entry fees, custom boards (SPEED-gated) | Additional revenue streams |
| **Prediction markets** | Bet on pro chess match outcomes (future) | New revenue vertical |
| **Gas sponsorship** | Users burn SPEED to cover gas (reduces circulating supply) | Deflationary pressure |

---

## Part F: Implementation Plan

### Phase 1: Token Creation & Liquidity (Pre-Hackathon or Day 1-2)

1. Design token art/logo (simple chess-themed icon)
2. Create SPL token manually via script (Metaplex Umi or `spl-token` CLI)
   - Total supply: 1,000,000,000
   - Decimals: 9
   - Mint 600M to developer wallet
   - Mint 150M to liquidity wallet
   - Mint 250M to treasury wallet
3. Upload metadata to IPFS (name, symbol, image, description)
4. Create Raydium CPMM pool: 150M SPEED + equivalent SOL/USDC (~$500-$1000 initial liquidity)
5. Verify token appears on Raydium, Jupiter, Birdeye

### Phase 2: PlayerStats Account (Day 2-3)

1. Add `PlayerStats` account struct to `state/`
2. Add `player_one_stats` and `player_two_stats` accounts to `ProcessMatchSettlement` context
3. Initialize/update `PlayerStats` in the settlement handler
4. Write tests: verify `games_played` increments after settlement
5. Deploy updated program to devnet

### Phase 3: Claim Instruction (Day 3-4)

1. Add `RewardClaim`, `ClaimCounter` account structs
2. Add `claim_game_reward` instruction with full context
3. Write the `determine_claim_amount` helper with tiered amounts
4. Build backend relay endpoint:
   - Endpoint: `POST /api/claim-reward`
   - Verifies user wallet has `games_played > 0`
   - Builds + signs + submits claim transaction with dev wallet
   - Returns transaction signature
5. Frontend: "Claim Your SPEED" button on profile page
   - Only visible if `games_played > 0` and no existing `RewardClaim` PDA
   - Shows claim amount based on current tier
   - Loading state while relay processes
6. Write integration tests on devnet

### Phase 4: Token Utility (Post-Hackathon)

1. Token-gated platform fee discounts (hold SPEED -> lower fees)
2. Gas sponsorship: burn SPEED to cover MagicBlock fees
3. Stake-for-fee-share program
4. Governance DAO

### Phase 5: Sybil Hardening (Post-Hackathon)

1. Integrate Proof of Human verification
2. Minimum $1 bet requirement for claim eligibility
3. 24-hour cooldown between account creation and claim eligibility

---

## Part G: Branding Ideas

| Name | Ticker | Rationale | Rating |
|------|--------|-----------|--------|
| **Speed** | **$SPEED** | Direct, memorable, tied to product name. Domain-friendly. | Recommended |
| Checkmate | $MATE | Chess terminology, short, catchy. Good backup option. | Good |
| Blitz | $BLITZ | Chess format (blitz chess = fast chess). Fits "speed" theme. | Good |
| Check | $CHECK | Single syllable, but sounds like a verification action. | Okay |
| Magic | $MAGIC | Confusion risk with Magic Eden ($ME), MagicBlock. Avoid. | Avoid |

### Recommended: $SPEED

- Short, pronounceable, memorable
- Directly tied to "Speed Chess" product
- No existing major token with this ticker on Solana
- Works in sentences: "Earn SPEED by playing chess", "Stake your SPEED", "Speed up your game"

---

## Part H: Key Configuration Values

```
TOKEN_NAME: "Speed Chess Token"
TOKEN_SYMBOL: "SPEED"
TOKEN_DECIMALS: 9
TOTAL_SUPPLY: 1_000_000_000_000_000_000  // 1B with 9 decimals
DEV_WALLET_ALLOCATION: 600_000_000_000_000_000  // 60%
LP_ALLOCATION: 150_000_000_000_000_000  // 15%
TREASURY_ALLOCATION: 150_000_000_000_000_000  // 15%
MARKETING_ALLOCATION: 100_000_000_000_000_000  // 10%

CLAIM_TIER_1_THRESHOLD: 1_000 claims
CLAIM_TIER_1_AMOUNT: 10_000_000_000_000  // 10,000 SPEED
CLAIM_TIER_2_THRESHOLD: 6_000 claims
CLAIM_TIER_2_AMOUNT: 5_000_000_000_000  // 5,000 SPEED
CLAIM_TIER_3_THRESHOLD: 26_000 claims
CLAIM_TIER_3_AMOUNT: 1_000_000_000_000  // 1,000 SPEED
CLAIM_TIER_4_AMOUNT: 500_000_000_000  // 500 SPEED

RAYDIUM_CPMM_POOL_CREATION_COST: ~0.25 SOL
ESTIMATED_LP_SEED: $500-$1000 worth of SOL + SPEED
```

---

## Part I: Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **No launchpad exposure** | Token has no initial trading volume or community | Active marketing in Solana chess/gaming communities; tournament prizes in SPEED |
| **Dev wallet key compromise** | All 60% reserve tokens stolen | Use hardware wallet or multisig; split across 2-of-3 multisig |
| **Sybil farming** | Attackers create many wallets, play minimum games, drain claims | Progressive claim amounts + minimum bet + Proof of Human |
| **Token lacks value** | Users claim and immediately dump | Buyback mechanism (platform fees buy SPEED); utility creates natural demand |
| **Claim relay server downtime** | Users can't claim | Add a "claim with your own gas" fallback; eventually migrate to PDA dev wallet |
| **MagicBlock fee increases** | Platform costs exceed revenue | Adjustable platform fee parameter; token utility covers gap |
| **Regulatory risk** | Token classified as security | Utility token design (burn for services, not profit-sharing); legal review |

---

## Appendix: File Changes Summary

### New Files to Create

```
anchor/programs/speed-chess/src/
  state/
    player_stats.rs       -- PlayerStats account struct
    reward_claim.rs       -- RewardClaim account struct
    claim_counter.rs      -- ClaimCounter account struct
  instructions/
    claim_game_reward.rs  -- Claim instruction + ClaimGameReward context
```

### Existing Files to Modify

```
anchor/programs/speed-chess/src/
  lib.rs                               -- Add claim_game_reward dispatcher
  instructions/mod.rs                  -- Re-export new module
  instructions/process_match_settlement.rs -- Add PlayerStats init/update
  state/mod.rs                         -- Re-export new state types
  errors/mod.rs                        -- Add new error variants
  events/mod.rs                        -- Add RewardClaimedEvent
```

### Non-Program Files

```
scripts/
  create-token.ts        -- SPL token creation script (Metaplex Umi)
  create-liquidity.ts    -- Raydium CPMM pool creation script
  fund-dev-wallet.ts     -- Transfer 60% supply to dev wallet ATA

backend/
  routes/claim-reward.ts -- Relay endpoint for claim submission

frontend/
  components/ClaimButton.tsx  -- "Claim SPEED" UI component
  hooks/useClaimStatus.ts     -- Check if wallet can claim
```
