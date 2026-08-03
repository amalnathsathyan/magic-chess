// src/instructions/claim_prediction_winnings.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, GameStatus, PredictionBet, PredictionPool};

#[derive(Accounts)]
pub struct ClaimPredictionWinnings<'info> {
    /// The ChessMatch — read-only, used for constraints.
    #[account(
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    /// The PredictionPool — must be settled. Mutable so Anchor allows PDA signing.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump = prediction_pool.bump,
        constraint = prediction_pool.settlement_processed @ ChessError::SettlementAlreadyProcessed,
    )]
    pub prediction_pool: Account<'info, PredictionPool>,

    /// The bettor's PredictionBet PDA.
    #[account(
        mut,
        seeds = [
            PREDICTION_BET_SEED,
            prediction_pool.key().as_ref(),
            bettor.key().as_ref(),
        ],
        bump = prediction_bet.bump,
        constraint = prediction_bet.bettor == bettor.key() @ ChessError::InvalidOwner,
        constraint = !prediction_bet.claimed @ ChessError::AlreadyClaimed,
    )]
    pub prediction_bet: Account<'info, PredictionBet>,

    /// Vault token account holding all spectator bets.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_VAULT_SEED, prediction_pool.key().as_ref()],
        bump,
    )]
    pub prediction_pool_vault: Box<Account<'info, TokenAccount>>,

    /// The bettor's token account (destination for winnings).
    #[account(
        mut,
        constraint = bettor_token_account.owner == bettor.key() @ ChessError::InvalidOwner,
        constraint = bettor_token_account.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub bettor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_prediction_winnings(ctx: Context<ClaimPredictionWinnings>) -> Result<()> {
    let prediction_pool = &ctx.accounts.prediction_pool;
    let prediction_bet = &mut ctx.accounts.prediction_bet;
    let chess_match = &ctx.accounts.chess_match;

    // Determine which outcome won
    let winning_outcome: u8 = match chess_match.game_status {
        GameStatus::WhiteWins => 0,
        GameStatus::BlackWins => 1,
        GameStatus::Draw => 2,
        _ => return err!(ChessError::GameNotConcluded),
    };

    // Check if bettor picked the winning outcome
    require!(
        prediction_bet.predicted_outcome == winning_outcome,
        ChessError::NothingToClaim,
    );

    // Calculate payout
    let total_pool = prediction_pool
        .total_bet_on_white
        .checked_add(prediction_pool.total_bet_on_black)
        .ok_or(ChessError::MathError)?
        .checked_add(prediction_pool.total_bet_on_draw)
        .ok_or(ChessError::MathError)?;

    let winning_pool_total = match winning_outcome {
        0 => prediction_pool.total_bet_on_white,
        1 => prediction_pool.total_bet_on_black,
        2 => prediction_pool.total_bet_on_draw,
        _ => return err!(ChessError::InvalidOutcome),
    };

    require!(winning_pool_total > 0, ChessError::NothingToClaim);

    let losing_pool = total_pool
        .checked_sub(winning_pool_total)
        .ok_or(ChessError::MathError)?;

    // Deduct platform fee from losing pool
    let platform_fee = losing_pool
        .checked_mul(prediction_pool.platform_fee_bps as u64)
        .ok_or(ChessError::MathError)?
        .checked_div(PLATFORM_FEE_MAX_BPS as u64)
        .ok_or(ChessError::MathError)?;

    let winner_share_pool = winning_pool_total
        .checked_add(losing_pool)
        .ok_or(ChessError::MathError)?
        .checked_sub(platform_fee)
        .ok_or(ChessError::MathError)?;

    // Individual payout = (bettor_amount / winning_pool_total) * winner_share_pool
    let payout = (prediction_bet.amount as u128)
        .checked_mul(winner_share_pool as u128)
        .ok_or(ChessError::MathError)?
        .checked_div(winning_pool_total as u128)
        .ok_or(ChessError::MathError)?;

    require!(payout > 0, ChessError::NothingToClaim);
    let payout_u64: u64 = payout.try_into().map_err(|_| ChessError::MathError)?;

    // Transfer winnings from pool vault to bettor
    // Use PDA signer seeds for the prediction_pool as authority over the vault
    let bump = prediction_pool.bump;
    let seeds = &[
        PREDICTION_POOL_SEED,
        chess_match.match_id.as_bytes(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.prediction_pool_vault.to_account_info(),
        to: ctx.accounts.bettor_token_account.to_account_info(),
        authority: ctx.accounts.prediction_pool.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, payout_u64)?;

    // Mark the bet as claimed
    prediction_bet.claimed = true;

    msg!(
        "Claimed prediction winnings: bettor={}, amount={}, payout={}",
        prediction_bet.bettor,
        prediction_bet.amount,
        payout_u64,
    );
    Ok(())
}
