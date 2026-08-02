# Magic Speed Chess -- Fee Split & Treasury Vault Design

## 1. Architecture Decision

**Chosen approach: Option A -- PDA-Controlled Treasury Vault**

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| A | PDA-controlled vault, program-authorised withdrawals | Trustless, no external dependency, atomic with settlement | Must write governance/buyback instructions | **Selected** |
| B | Multi-sig (Squads/Serum) | Flexible, no program changes needed | External dependency, manual coordination, not atomic | Overkill for MVP |
| C | Dev-controlled with timelock | Simple to implement | Centralised, trust assumption | Defeats trustless goal |

**Rationale:** A PDA treasury is trustless, costs nothing extra, and fits the existing architecture (the program already uses PDA escrows for matches). Multi-sigs can be layered on later by changing the `treasury.authority` field from the developer wallet to a DAO pubkey.

---

## 2. Account Struct Designs

### 2.1 PlatformConfig (Global, one per program)

```rust
// src/state/platform_config.rs

use anchor_lang::prelude::*;

/// Global platform configuration.
/// PDA seeds: [b"platform_config"]
#[account]
#[derive(InitSpace, Debug)]
pub struct PlatformConfig {
    /// Authority that can update fee parameters and trigger treasury actions.
    /// Initially set to the developer wallet; upgradeable to a DAO multisig.
    pub authority: Pubkey,

    /// Developer fee wallet -- receives 50% of every match's platform fee.
    /// Also the wallet that receives token launch revenue share (if any).
    pub developer_fee_wallet: Pubkey,

    /// Fee split in basis points going to the treasury.
    /// 5000 = 50% to treasury, 50% to developer.
    /// 6000 = 60% to treasury, 40% to developer.
    /// Max 10000 (= 100% to treasury).
    pub fee_split_bps: u16,

    /// Default platform fee in basis points for new matches.
    /// 200 = 2% fee on the total pot.
    pub default_platform_fee_bps: u16,

    /// Bump seed for the PDA.
    pub bump: u8,
}

/// PDA seeds for PlatformConfig.
pub const PLATFORM_CONFIG_SEED: &[u8] = b"platform_config";
```

### 2.2 TreasuryVault (One per SPL token mint)

```rust
// src/state/treasury_vault.rs

use anchor_lang::prelude::*;

/// Per-mint treasury vault tracking accumulated fees.
/// If the game supports USDC and SEND bets, there will be *two* TreasuryVault PDAs --
/// one per mint -- each holding that mint's share of fees.
/// PDA seeds: [b"treasury_vault", token_mint.as_ref()]
#[account]
#[derive(InitSpace, Debug)]
pub struct TreasuryVault {
    /// Who can call execute_buyback / withdraw_treasury.
    /// Initially the developer; upgradeable to a DAO.
    pub authority: Pubkey,

    /// Which SPL token this vault accumulates (e.g. USDC, SEND).
    pub token_mint: Pubkey,

    /// Lifetime fees collected into this vault (informational, in raw token units).
    pub total_fees_collected: u64,

    /// Lifetime buyback volume executed from this vault (informational).
    pub total_buybacks_executed: u64,

    /// Bump seed for the PDA.
    pub bump: u8,
}

/// PDA seeds prefix.
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury_vault";
```

### 2.3 ChessMatch (no structural change needed)

The `ChessMatch` account already has `platform_fee_basis_points: u16`. It does **not** need to store `platform_fee_wallet` or `treasury_vault` -- those are global config read from `PlatformConfig` at settlement time. This avoids per-match storage bloat.

```rust
// Existing field in ChessMatch -- keep as-is:
pub platform_fee_basis_points: u16,  // e.g., 200 = 2%
```

---

## 3. Updated Payout Logic (50/50 Split)

### 3.1 `process_payout` -- Winner gets their share

```rust
// src/utils/payout_logic.rs

/// Transfer the platform fee split into two destinations:
/// 1. treasury_fee -> Treasury Vault ATA  (50%, or config.split_bps / 10000)
/// 2. developer_fee -> Developer Wallet ATA (the remainder)
pub fn process_payout<'info>(
    chess_match: &Account<'info, ChessMatch>,
    match_escrow_token_account_info: &AccountInfo<'info>,
    winner_token_account_info: &AccountInfo<'info>,
    treasury_vault_ata_info: &AccountInfo<'info>,   // NEW
    developer_wallet_ata_info: &AccountInfo<'info>, // NEW (was platform_token_account_info)
    token_program: &Program<'info, Token>,
    program_id: &Pubkey,
    match_escrow_token_account_data: &Account<'info, TokenAccount>,
    fee_split_bps: u16, // Read from PlatformConfig
) -> Result<()> {
    let (pda_authority, bump_seed) = Pubkey::find_program_address(
        &[b"match_escrow", &chess_match.match_id.as_bytes()],
        program_id,
    );

    if match_escrow_token_account_data.owner != pda_authority {
        return err!(ChessError::InvalidEscrowAccount);
    }

    let match_id_bytes = chess_match.match_id.as_bytes();
    let seeds: &[&[u8]] = &[
        b"match_escrow",
        &match_id_bytes,
        &[bump_seed],
    ];
    let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];

    // --- Fee calculation (unchanged) ---
    let fee = chess_match.total_pot
        .checked_mul(chess_match.platform_fee_basis_points as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    let winner_amount = chess_match.total_pot
        .checked_sub(fee)
        .ok_or(ChessError::MathError)?;

    // --- NEW: 50/50 fee split ---
    // treasury_share = fee * fee_split_bps / 10000
    let treasury_share = fee
        .checked_mul(fee_split_bps as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    // developer_share = fee - treasury_share (handles rounding)
    let developer_share = fee
        .checked_sub(treasury_share)
        .ok_or(ChessError::MathError)?;

    // --- Transfer 1: Treasury vault (50%) ---
    if treasury_share > 0 {
        msg!("Transferring treasury fee share: {}", treasury_share);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: treasury_vault_ata_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            treasury_share,
        )?;
    }

    // --- Transfer 2: Developer wallet (50%) ---
    if developer_share > 0 {
        msg!("Transferring developer fee share: {}", developer_share);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: developer_wallet_ata_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            developer_share,
        )?;
    }

    // --- Transfer 3: Winner payout (unchanged) ---
    if winner_amount > 0 {
        msg!("Transferring winner amount: {}", winner_amount);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: winner_token_account_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            winner_amount,
        )?;
    }

    Ok(())
}
```

### 3.2 `process_draw_payout` -- Both players get a refund

```rust
/// Draw payout: fee is split 50/50 between treasury and developer,
/// then each player gets half of the remaining pot.
pub fn process_draw_payout<'info>(
    chess_match: &Account<'info, ChessMatch>,
    match_escrow_token_account_info: &AccountInfo<'info>,
    player_one_token_account_info: &AccountInfo<'info>,
    player_two_token_account_info: &AccountInfo<'info>,
    treasury_vault_ata_info: &AccountInfo<'info>,   // NEW
    developer_wallet_ata_info: &AccountInfo<'info>, // NEW
    token_program: &Program<'info, Token>,
    program_id: &Pubkey,
    match_escrow_token_account_data: &Account<'info, TokenAccount>,
    fee_split_bps: u16, // Read from PlatformConfig
) -> Result<()> {
    let (pda_authority, bump_seed) = Pubkey::find_program_address(
        &[b"match_escrow", &chess_match.match_id.as_bytes()],
        program_id,
    );

    if match_escrow_token_account_data.owner != pda_authority {
        return err!(ChessError::InvalidEscrowAccount);
    }

    let match_id_bytes = chess_match.match_id.as_bytes();
    let seeds: &[&[u8]] = &[
        b"match_escrow",
        &match_id_bytes,
        &[bump_seed],
    ];
    let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];

    // --- Fee calculation (unchanged) ---
    let fee = chess_match.total_pot
        .checked_mul(chess_match.platform_fee_basis_points as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    let remaining_pot = chess_match.total_pot
        .checked_sub(fee)
        .ok_or(ChessError::MathError)?;

    let player_one_refund = remaining_pot
        .checked_div(2)
        .ok_or(ChessError::MathError)?;

    let player_two_refund = remaining_pot
        .checked_sub(player_one_refund)
        .ok_or(ChessError::MathError)?;

    // --- NEW: 50/50 fee split ---
    let treasury_share = fee
        .checked_mul(fee_split_bps as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    let developer_share = fee
        .checked_sub(treasury_share)
        .ok_or(ChessError::MathError)?;

    // --- Transfer 1: Treasury vault ---
    if treasury_share > 0 {
        msg!("Transferring treasury fee share (draw): {}", treasury_share);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: treasury_vault_ata_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            treasury_share,
        )?;
    }

    // --- Transfer 2: Developer wallet ---
    if developer_share > 0 {
        msg!("Transferring developer fee share (draw): {}", developer_share);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: developer_wallet_ata_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            developer_share,
        )?;
    }

    // --- Transfer 3: Player 1 refund (unchanged) ---
    if player_one_refund > 0 {
        msg!("Transferring player one refund: {}", player_one_refund);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: player_one_token_account_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            player_one_refund,
        )?;
    }

    // --- Transfer 4: Player 2 refund (unchanged) ---
    if player_two_refund > 0 {
        msg!("Transferring player two refund: {}", player_two_refund);
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                Transfer {
                    from: match_escrow_token_account_info.clone(),
                    to: player_two_token_account_info.clone(),
                    authority: match_escrow_token_account_info.clone(),
                },
                signer_seeds,
            ),
            player_two_refund,
        )?;
    }

    Ok(())
}
```

---

## 4. Updated `ProcessMatchSettlement` Accounts

```rust
// src/instructions/process_match_settlement.rs

#[derive(Accounts)]
pub struct ProcessMatchSettlement<'info> {
    // --- Existing accounts (unchanged) ---
    #[account(
        mut,
        seeds = [b"chess_match", chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = (
            chess_match.game_status == GameStatus::WhiteWins ||
            chess_match.game_status == GameStatus::BlackWins ||
            chess_match.game_status == GameStatus::Draw
        ) @ ChessError::GameNotConcluded,
        constraint = !chess_match.payout_processed @ ChessError::PayoutAlreadyProcessed,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(
        mut,
        seeds = [b"match_escrow", chess_match.match_id.as_bytes()],
        bump,
    )]
    pub match_escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = player_one_ata.owner == chess_match.players[0] @ ChessError::PlayerTokenAccountMismatch,
        constraint = player_one_ata.mint == chess_match.betting_token_mint @ ChessError::PlayerTokenAccountMismatch,
    )]
    pub player_one_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = player_two_ata.owner == chess_match.players[1] @ ChessError::PlayerTokenAccountMismatch,
        constraint = player_two_ata.mint == chess_match.betting_token_mint @ ChessError::PlayerTokenAccountMismatch,
    )]
    pub player_two_ata: Account<'info, TokenAccount>,

    // --- NEW: Developer fee wallet ATA (replaces old platform_fee_ata) ---
    #[account(
        mut,
        constraint = developer_wallet_ata.mint == chess_match.betting_token_mint
            @ ChessError::PlatformTokenAccountError,
        // Owner constraint checked at runtime against PlatformConfig.developer_fee_wallet
    )]
    pub developer_wallet_ata: Account<'info, TokenAccount>,

    // --- NEW: Treasury vault PDA account (on-chain data) ---
    #[account(
        mut,
        seeds = [b"treasury_vault", chess_match.betting_token_mint.as_ref()],
        bump = treasury_vault.bump,
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,

    // --- NEW: Treasury vault ATA (holds actual tokens) ---
    /// The ATA owned by the treasury_vault PDA.
    /// If this is the first settlement for this mint, this ATA may need to be
    /// created by the caller (or created lazily in a separate instruction).
    #[account(
        mut,
        constraint = treasury_vault_ata.mint == chess_match.betting_token_mint
            @ ChessError::PlatformTokenAccountError,
    )]
    pub treasury_vault_ata: Account<'info, TokenAccount>,

    // --- NEW: Global platform config ---
    #[account(
        seeds = [b"platform_config"],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub token_program: Program<'info, Token>,
}
```

### Updated handler

```rust
pub fn handler(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;

    let match_escrow_data = &ctx.accounts.match_escrow_token_account;
    let player_one_ata_data = &ctx.accounts.player_one_ata;
    let player_two_ata_data = &ctx.accounts.player_two_ata;
    let developer_wallet_ata_data = &ctx.accounts.developer_wallet_ata;
    let treasury_vault_ata_data = &ctx.accounts.treasury_vault_ata;

    let match_escrow_info = match_escrow_data.to_account_info();
    let player_one_ata_info = player_one_ata_data.to_account_info();
    let player_two_ata_info = player_two_ata_data.to_account_info();
    let developer_wallet_ata_info = developer_wallet_ata_data.to_account_info();
    let treasury_vault_ata_info = treasury_vault_ata_data.to_account_info();

    let token_program_info = &ctx.accounts.token_program;
    let current_program_id = ctx.program_id;

    // --- NEW: Validate developer wallet owner against PlatformConfig ---
    require!(
        developer_wallet_ata_data.owner == ctx.accounts.platform_config.developer_fee_wallet,
        ChessError::PlatformTokenAccountError
    );

    // --- NEW: Validate treasury vault ATA is owned by the treasury PDA ---
    let (treasury_pda, _treasury_bump) = Pubkey::find_program_address(
        &[b"treasury_vault", chess_match.betting_token_mint.as_ref()],
        current_program_id,
    );
    require!(
        treasury_vault_ata_data.owner == treasury_pda,
        ChessError::TreasuryVaultOwnerMismatch // New error variant
    );

    let fee_split_bps = ctx.accounts.platform_config.fee_split_bps;

    msg!("Processing settlement for match: {}", chess_match.match_id);
    msg!("Game status: {:?}", chess_match.game_status);
    msg!("Total pot: {}", chess_match.total_pot);

    match chess_match.game_status {
        GameStatus::WhiteWins => {
            msg!("White wins. Payout to player 1: {}", chess_match.players[0]);
            payout_logic::process_payout(
                chess_match,
                &match_escrow_info,
                &player_one_ata_info,
                &treasury_vault_ata_info,       // NEW
                &developer_wallet_ata_info,      // NEW (was platform_fee_ata_info)
                token_program_info,
                current_program_id,
                match_escrow_data,
                fee_split_bps,                   // NEW
            )?;
        }
        GameStatus::BlackWins => {
            msg!("Black wins. Payout to player 2: {}", chess_match.players[1]);
            if chess_match.players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }
            payout_logic::process_payout(
                chess_match,
                &match_escrow_info,
                &player_two_ata_info,
                &treasury_vault_ata_info,       // NEW
                &developer_wallet_ata_info,      // NEW
                token_program_info,
                current_program_id,
                match_escrow_data,
                fee_split_bps,                   // NEW
            )?;
        }
        GameStatus::Draw => {
            msg!("Game is a draw. Refunding players.");
            if chess_match.players[0] == Pubkey::default() || chess_match.players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }
            payout_logic::process_draw_payout(
                chess_match,
                &match_escrow_info,
                &player_one_ata_info,
                &player_two_ata_info,
                &treasury_vault_ata_info,       // NEW
                &developer_wallet_ata_info,      // NEW
                token_program_info,
                current_program_id,
                match_escrow_data,
                fee_split_bps,                   // NEW
            )?;
        }
        _ => return err!(ChessError::GameNotConcluded),
    }

    // --- NEW: Update treasury on-chain stats ---
    let treasury_vault = &mut ctx.accounts.treasury_vault;
    // Track accumulated fees. The actual fee is calculated identically to payout_logic.
    let fee = chess_match.total_pot
        .checked_mul(chess_match.platform_fee_basis_points as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    let treasury_share = fee
        .checked_mul(fee_split_bps as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;

    treasury_vault.total_fees_collected = treasury_vault
        .total_fees_collected
        .checked_add(treasury_share)
        .ok_or(ChessError::MathError)?;

    chess_match.payout_processed = true;

    // --- Emit updated event ---
    emit!(PayoutEvent {
        match_id: chess_match.match_id.clone(),
        winner: chess_match.players[0], // TODO: set correctly for BlackWins
        amount: winner_amount,          // TODO: capture from payout_logic return
        fee,
        treasury_share,
        developer_share: fee.checked_sub(treasury_share).unwrap_or(0),
    });

    msg!("Settlement processed successfully for match: {}", chess_match.match_id);
    Ok(())
}
```

### Updated PayoutEvent

```rust
// src/events/mod.rs -- add to PayoutEvent and DrawPayoutEvent

#[event]
pub struct PayoutEvent {
    pub match_id: String,
    pub winner: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub treasury_share: u64,     // NEW
    pub developer_share: u64,    // NEW
}

#[event]
pub struct DrawPayoutEvent {
    pub match_id: String,
    pub white_player: Pubkey,
    pub black_player: Pubkey,
    pub amount_each: u64,
    pub fee: u64,
    pub treasury_share: u64,     // NEW
    pub developer_share: u64,    // NEW
}
```

---

## 5. Buyback Mechanism Design

### 5.1 MVP: Manual Withdrawal (Phase 1)

The simplest approach -- no on-chain DEX integration. The authority withdraws tokens from the treasury ATA and performs the buyback off-chain.

```rust
// src/instructions/withdraw_treasury.rs

/// Allows the PlatformConfig.authority to withdraw tokens from a treasury vault ATA.
/// Used for manual buybacks: withdraw USDC, swap on Jupiter/Bags.fm for project token, burn it.
#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"platform_config"],
        bump = platform_config.bump,
        constraint = authority.key() == platform_config.authority
            @ ChessError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"treasury_vault", treasury_vault.token_mint.as_ref()],
        bump = treasury_vault.bump,
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,

    /// The ATA that holds treasury tokens (PDA-owned).
    /// Authority is the treasury_vault PDA.
    #[account(
        mut,
        constraint = treasury_vault_ata.mint == treasury_vault.token_mint
            @ ChessError::PlatformTokenAccountError,
        constraint = treasury_vault_ata.owner == treasury_vault.key()
            @ ChessError::TreasuryVaultOwnerMismatch,
    )]
    pub treasury_vault_ata: Account<'info, TokenAccount>,

    /// Destination ATA for the withdrawn tokens.
    /// Typically the developer wallet's ATA for this mint.
    #[account(
        mut,
        constraint = destination_ata.mint == treasury_vault.token_mint
            @ ChessError::PlatformTokenAccountError,
    )]
    pub destination_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    let treasury_vault = &ctx.accounts.treasury_vault;
    let bump = treasury_vault.bump;
    let token_mint = treasury_vault.token_mint;

    let seeds: &[&[u8]] = &[
        b"treasury_vault",
        token_mint.as_ref(),
        &[bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];

    msg!("Withdrawing {} tokens from treasury vault for mint: {}", amount, token_mint);

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer {
                from: ctx.accounts.treasury_vault_ata.to_account_info().clone(),
                to: ctx.accounts.destination_ata.to_account_info().clone(),
                authority: ctx.accounts.treasury_vault.to_account_info().clone(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(TreasuryWithdrawalEvent {
        token_mint,
        amount,
        destination: ctx.accounts.destination_ata.owner,
    });

    Ok(())
}

#[event]
pub struct TreasuryWithdrawalEvent {
    pub token_mint: Pubkey,
    pub amount: u64,
    pub destination: Pubkey,
}
```

### 5.2 Automated Buyback via Jupiter CPI (Phase 2 / Stretch)

For a future upgrade, the program can CPI into Jupiter's swap instruction directly on-chain:

```rust
// src/instructions/execute_buyback.rs (conceptual -- Phase 2)

/// Fully on-chain buyback: swaps treasury USDC for project tokens via Jupiter,
/// then burns the project tokens (or sends them to a dead wallet).
///
/// PREREQUISITES:
/// - Jupiter CPI program deployed or Jupiter Router program ID known
/// - Route plan constructed off-chain and passed as instruction data
/// - Treasury vault ATA has sufficient balance
///
/// This is a stretch goal. The manual WithdrawTreasury path is the MVP.
#[derive(Accounts)]
pub struct ExecuteBuyback<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"platform_config"],
        bump = platform_config.bump,
        constraint = authority.key() == platform_config.authority
            @ ChessError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"treasury_vault", treasury_vault.token_mint.as_ref()],
        bump = treasury_vault.bump,
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,

    #[account(mut)]
    pub treasury_vault_ata: Account<'info, TokenAccount>,

    /// CHECK: Jupiter router program
    pub jupiter_program: AccountInfo<'info>,

    /// CHECK: All accounts required by Jupiter's swap instruction
    /// (token mints, AMM pools, oracles, etc.)
    #[account(mut)]
    pub remaining_accounts: ...

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<ExecuteBuyback>,
    amount_in: u64,              // USDC amount to swap
    min_amount_out: u64,         // Min project tokens to receive (slippage protection)
    route_data: Vec<u8>,         // Jupiter route plan (off-chain computed)
) -> Result<()> {
    // 1. Transfer USDC from treasury_vault_ata to Jupiter's intermediate account
    // 2. CPI to Jupiter Router with the route data
    // 3. Receive project tokens in a buyback_burn_wallet_ata
    // 4. Transfer project tokens to dead wallet (burn)
    //    or use token::burn if the program is the mint authority
    // 5. Update treasury_vault.total_buybacks_executed
    // 6. Emit BuybackExecutedEvent
    todo!("Phase 2: Jupiter CPI integration");
}
```

**Recommendation:** Start with manual withdrawal. Jupiter CPI on-chain adds meaningful complexity (route construction, account forwarding, slippage). The manual path is trust-minimised because the treasury PDA's authority can be rotated to a DAO multisig, and all withdrawals are on-chain events for full transparency.

---

## 6. Developer Wallet Revenue Streams Analysis

### Revenue Stream 1: 50% of Platform Fees (Automated)

- **Source:** Every match settlement
- **Token:** The betting token (USDC, SEND, wSOL, etc.)
- **Mechanism:** `payout_logic` transfers 50% of the fee directly to `developer_wallet_ata` at settlement
- **Frequency:** Real-time, per match
- **Programmatic:** Fully on-chain, no manual intervention

### Revenue Stream 2: Token Launch -- Initial Capital (One-time)

- **Source:** pump.fun / Bags.fm bonding curve exit
- **Token:** Usually SOL (or USDC on Bags.fm)
- **What happens:**
  - Tokens are created on the bonding curve
  - When the curve reaches a target market cap (e.g., $69k on pump.fun), liquidity migrates to Raydium
  - The creator (you) receives the liquidity raised minus Raydium LP seeding
- **Ongoing revenue after migration:** None. Pump.fun does not give creators an ongoing share of Raydium LP fees. Any fees after migration go to LP providers (including you, if you hold LP tokens).
- **Bags.fm:** Similar model -- creator revenue is from the bonding curve phase only. No ongoing share of DEX trading fees after migration.

### Revenue Stream 3: 60% of Project Token Supply (Vesting/Claims)

- **Source:** Your allocation from the token launch
- **Use case:** Drip claims for players, staking rewards, liquidity mining
- **Not revenue per se** -- it is your treasury to distribute. Selling it on the open market converts it to revenue; distributing it to users builds ecosystem value.

### Revenue Stream 4: Potential -- Bags.fm / pump.fun Revenue Share

- **Research finding:** Neither pump.fun nor Bags.fm currently offers ongoing creator revenue share from DEX trading. Creator earnings are front-loaded: profits come from the bonding curve phase (traders buy in at progressively higher prices; creator's token allocation appreciates).
- **If** either platform introduces revenue sharing in the future, the `developer_fee_wallet` field in `PlatformConfig` is the designated address to receive it. No program change needed -- just update the address in `PlatformConfig` if required.

### Summary Table

| Revenue Stream | Frequency | Token | On-Chain? | Notes |
|----------------|-----------|-------|-----------|-------|
| 50% platform fees | Per match | Betting token (USDC/SEND) | Yes, automatic | Primary ongoing revenue |
| 50% treasury allocation | Per match | Betting token | Yes, automatic | Accumulates; used for buybacks |
| Token launch exit | One-time | SOL/USDC | Off-chain | Bonding curve migration |
| Project token allocation | One-time | Project token | Off-chain | Your 60% for claims/drips |
| DEX LP fees (post-migration) | Ongoing | SOL + project token | Off-chain | Only if you hold LP tokens |
| Platform rev share (future) | TBD | TBD | TBD | Not currently offered |

---

## 7. Implementation Phases

### Phase 0: New Account Types + Config Setup (1 session)

Files to create:
- `src/state/platform_config.rs`
- `src/state/treasury_vault.rs`
- `src/instructions/initialize_platform_config.rs`

Files to modify:
- `src/state/mod.rs` -- add `pub mod platform_config; pub mod treasury_vault;`
- `src/instructions/mod.rs` -- add `pub mod initialize_platform_config;`
- `src/errors/mod.rs` -- add new error variants
- `src/events/mod.rs` -- add `TreasuryWithdrawalEvent`, update `PayoutEvent`/`DrawPayoutEvent`
- `src/lib.rs` -- add `initialize_platform_config` dispatch

### Phase 1: Fee Split in Settlement (1 session)

Files to modify:
- `src/utils/payout_logic.rs` -- split fee into 2 transfers
- `src/instructions/process_match_settlement.rs` -- replace `platform_fee_ata` with `developer_wallet_ata` + `treasury_vault_ata` + `treasury_vault` + `platform_config`

### Phase 2: Treasury Withdrawal (1 session)

Files to create:
- `src/instructions/withdraw_treasury.rs`

Files to modify:
- `src/instructions/mod.rs` -- add module
- `src/lib.rs` -- add dispatch

### Phase 3: Update Platform Config (1 session)

Files to create:
- `src/instructions/update_platform_config.rs`

### Phase 4: Testing + Deployment (2 sessions)

- Unit tests for fee split maths (rounding edge cases: 1 token fee with 50/50 split)
- Integration tests for full settlement flow with new accounts
- Devnet deployment
- Create treasury ATAs on devnet
- Run `initialize_platform_config`
- Test a full match lifecycle

### Phase 5: Automated Buyback (Stretch)

- Research Jupiter CPI interface
- Implement `execute_buyback` instruction
- Test with Jupiter devnet router

---

## 8. New Instruction Pseudocode

### 8.1 `initialize_platform_config`

```
Accounts:
  - authority: Signer (mut, payer)
  - platform_config: PDA [b"platform_config"] (init)
  - system_program: Program

Params: None (uses hardcoded defaults)

Logic:
  1. Init PlatformConfig PDA
  2. Set authority = caller (developer wallet)
  3. Set developer_fee_wallet = caller
  4. Set fee_split_bps = 5000 (50/50)
  5. Set default_platform_fee_bps = 200 (2%)
  6. Emit PlatformConfigInitialized event
```

### 8.2 `update_platform_config`

```
Accounts:
  - authority: Signer
  - platform_config: PDA [b"platform_config"] (mut)
    constraint authority.key() == platform_config.authority

Params:
  - new_developer_fee_wallet: Option<Pubkey>
  - new_fee_split_bps: Option<u16>
  - new_default_platform_fee_bps: Option<u16>

Logic:
  1. If new_developer_fee_wallet.is_some(), update field
  2. If new_fee_split_bps.is_some(), validate <= 10000, update field
  3. If new_default_platform_fee_bps.is_some(), validate <= 10000, update field
  4. Emit PlatformConfigUpdated event
```

### 8.3 `withdraw_treasury`

```
Accounts:
  - authority: Signer (mut)
  - platform_config: PDA (read, constraint authority == platform_config.authority)
  - treasury_vault: PDA [b"treasury_vault", token_mint] (mut)
  - treasury_vault_ata: TokenAccount (mut, owned by treasury_vault PDA)
  - destination_ata: TokenAccount (mut)
  - token_program: Program

Params:
  - amount: u64

Logic:
  1. Verify authority == platform_config.authority
  2. CPI: Token::Transfer treasury_vault_ata -> destination_ata, signed by treasury_vault PDA
  3. Emit TreasuryWithdrawalEvent { token_mint, amount, destination }
```

### 8.4 `execute_buyback` (Phase 5 stretch goal)

```
Accounts:
  - authority: Signer
  - platform_config: PDA (read)
  - treasury_vault: PDA [b"treasury_vault", token_mint] (mut)
  - treasury_vault_ata: TokenAccount (mut)
  - jupiter_program: AccountInfo
  - [remaining accounts for Jupiter route]
  - token_program: Program

Params:
  - amount_in: u64
  - min_amount_out: u64
  - route_data: Vec<u8>

Logic:
  1. Verify authority
  2. CPI to Jupiter Router with route_data, amount_in, min_amount_out
  3. Receive project tokens into buyback_wallet_ata
  4. Transfer to dead wallet or burn
  5. Update treasury_vault.total_buybacks_executed += amount_in
  6. Emit BuybackExecutedEvent
```

---

## 9. New Error Variants

```rust
// Add to src/errors/mod.rs

#[error_code]
pub enum ChessError {
    // ... existing variants ...

    // --- New: Platform Config ---
    #[msg("Platform config PDA already initialized.")]
    PlatformConfigAlreadyInitialized,
    #[msg("Signer is not the platform authority.")]
    Unauthorized,

    // --- New: Treasury Vault ---
    #[msg("Treasury vault owner does not match the expected PDA.")]
    TreasuryVaultOwnerMismatch,
    #[msg("Treasury vault for this mint is not initialized.")]
    TreasuryVaultNotInitialized,
    #[msg("Insufficient treasury balance for withdrawal.")]
    InsufficientTreasuryBalance,

    // --- New: Fee Split ---
    #[msg("Fee split basis points must be <= 10000.")]
    InvalidFeeSplitBps,
}
```

---

## 10. Default Constants

```rust
// Add to crate root or a dedicated constants module (no existing constants.rs file was found)

/// PDA seed for the global platform config.
pub const PLATFORM_CONFIG_SEED: &[u8] = b"platform_config";

/// PDA seed prefix for per-mint treasury vaults.
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury_vault";

/// Default fee split: 5000 = 50% to treasury, 50% to developer.
pub const DEFAULT_FEE_SPLIT_BPS: u16 = 5000;

/// Default platform fee: 200 = 2% of total pot.
pub const DEFAULT_PLATFORM_FEE_BPS: u16 = 200;
```

---

## 11. Token Flow Diagram

```
Match Escrow (PDA)
       |
       |--- fee = total_pot * platform_fee_bps / 10000
       |         |
       |         |--- treasury_share = fee * fee_split_bps / 10000
       |         |         |
       |         |         v
       |         |    Treasury Vault ATA (PDA-owned)
       |         |         |
       |         |         | [Phase 2: authority calls withdraw_treasury]
       |         |         v
       |         |    Developer Wallet ATA
       |         |         |
       |         |         | [Off-chain: swap USDC for project token on Jupiter/Bags.fm]
       |         |         v
       |         |    Project Token bought -> burned (dead wallet)
       |         |
       |         |--- developer_share = fee - treasury_share
       |         |         |
       |         |         v
       |         |    Developer Wallet ATA (direct)
       |         |         |
       |         |         | [Developer keeps as revenue]
       |         |
       |         |--- winner_amount = total_pot - fee
       |                   |
       |                   v
       |              Winner ATA
```

---

## 12. Security Considerations

1. **Rounding:** When `fee_split_bps = 5000` and `fee = 1`, treasury gets 0, developer gets 1. The `checked_sub` approach ensures no tokens are lost and the developer absorbs rounding favouritism consistently.

2. **PlatformConfig immutability:** Only `authority` can update. Initially this is the developer. For production, rotate to a DAO or multisig.

3. **Treasury vault ATA creation:** The treasury ATA must be created before the first settlement for a given mint. This can be done lazily (first settlement creates it via a `create_treasury_ata_if_needed` helper) or upfront by the deployer. Lazy creation is recommended to avoid a separate deployment step per mint.

4. **Double-spend prevention:** `chess_match.payout_processed` flag (existing) prevents replay. Treasury vault PDA signatures prevent unauthorised transfers out.

5. **Token 2022 compatibility:** The current code uses `anchor_spl::token`. If the project token is Token-2022, switch to `anchor_spl::token_2022`. This is a separate concern from the fee split design.

---

## Appendix A: Treasury ATA Creation Helper

When a new betting token mint is used for the first time, the treasury vault ATA won't exist yet. Two strategies:

**Strategy 1: Lazy creation on first settlement (recommended)**
```rust
/// Ensure the treasury vault ATA exists, creating it if necessary.
/// Called at the top of process_match_settlement handler.
fn ensure_treasury_ata<'info>(
    treasury_vault: &Account<'info, TreasuryVault>,
    treasury_vault_ata: &Account<'info, TokenAccount>,
    betting_token_mint: &Pubkey,
    payer: &Signer<'info>,
    token_program: &Program<'info, Token>,
    system_program: &Program<'info, System>,
    associated_token_program: &Program<'info, AssociatedToken>,
) -> Result<()> {
    // If the ATA already exists with correct owner+mint, skip creation.
    // Otherwise create it via associated_token::create CPI.
    // This can be added as an optional account in ProcessMatchSettlement
    // that is only required when the treasury ATA does not yet exist.
    todo!()
}
```

**Strategy 2: Upfront creation by deployer (simpler for MVP)**
Deployer runs a `create_treasury_vault` instruction once per mint before any matches for that mint are settled.

---

## Appendix B: All Files Changed (Summary)

| File | Action | Description |
|------|--------|-------------|
| `state/platform_config.rs` | **Create** | Global platform config PDA |
| `state/treasury_vault.rs` | **Create** | Per-mint treasury vault PDA |
| `state/mod.rs` | **Edit** | Add `pub mod platform_config; pub mod treasury_vault;` |
| `instructions/initialize_platform_config.rs` | **Create** | One-time setup instruction |
| `instructions/update_platform_config.rs` | **Create** | Update fee params (authority-gated) |
| `instructions/withdraw_treasury.rs` | **Create** | Authority withdraws from treasury for manual buybacks |
| `instructions/process_match_settlement.rs` | **Edit** | Add `developer_wallet_ata`, `treasury_vault`, `treasury_vault_ata`, `platform_config` to accounts; update handler |
| `instructions/mod.rs` | **Edit** | Add new instruction modules |
| `utils/payout_logic.rs` | **Edit** | Split fee into 2 transfers (treasury + developer) |
| `errors/mod.rs` | **Edit** | Add 6 new error variants |
| `events/mod.rs` | **Edit** | Update `PayoutEvent`/`DrawPayoutEvent` with split fields; add `TreasuryWithdrawalEvent` |
| `lib.rs` | **Edit** | Add new instruction dispatchers |
