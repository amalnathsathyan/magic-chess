// src/instructions/initialize_prediction_pool.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, PredictionPool};

#[derive(Accounts)]
#[instruction(platform_fee_bps_arg: u16)]
pub struct InitializePredictionPool<'info> {
    /// The ChessMatch this pool tracks. Must have prediction_enabled = true.
    #[account(
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = chess_match.prediction_enabled @ ChessError::PredictionNotEnabled,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    /// PredictionPool PDA — one per match.
    #[account(
        init,
        payer = payer,
        space = ANCHOR_DISCRIMINATOR + PredictionPool::INIT_SPACE,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump,
    )]
    pub prediction_pool: Account<'info, PredictionPool>,

    /// Vault token account that holds all spectator bets. Owned by the prediction pool PDA.
    #[account(
        init,
        payer = payer,
        seeds = [PREDICTION_POOL_VAULT_SEED, prediction_pool.key().as_ref()],
        bump,
        token::mint = betting_token_mint,
        token::authority = prediction_pool,
    )]
    pub prediction_pool_vault: Account<'info, TokenAccount>,

    /// The SPL token mint used for betting (same as the chess match).
    pub betting_token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_prediction_pool(
    ctx: Context<InitializePredictionPool>,
    platform_fee_bps_arg: u16,
) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;
    let prediction_pool = &mut ctx.accounts.prediction_pool;

    // Validate platform fee BPS
    require!(
        platform_fee_bps_arg <= PLATFORM_FEE_MAX_BPS,
        ChessError::InvalidPlatformFee
    );

    prediction_pool.match_id = chess_match.match_id.clone();
    prediction_pool.chess_match = chess_match.key();
    prediction_pool.total_bet_on_white = 0;
    prediction_pool.total_bet_on_black = 0;
    prediction_pool.total_bet_on_draw = 0;
    prediction_pool.platform_fee_bps = platform_fee_bps_arg;
    prediction_pool.settlement_processed = false;
    prediction_pool.bump = ctx.bumps.prediction_pool;

    msg!(
        "Prediction pool initialized for match: {} with platform_fee_bps={}",
        prediction_pool.match_id,
        platform_fee_bps_arg,
    );
    Ok(())
}
