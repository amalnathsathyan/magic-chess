// src/instructions/settle_prediction_pool.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, GameStatus, PredictionPool};

#[derive(Accounts)]
pub struct SettlePredictionPool<'info> {
    #[account(
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = (
            chess_match.game_status == GameStatus::WhiteWins ||
            chess_match.game_status == GameStatus::BlackWins ||
            chess_match.game_status == GameStatus::Draw
        ) @ ChessError::GameNotConcluded,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(
        mut,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump = prediction_pool.bump,
        constraint = !prediction_pool.settlement_processed @ ChessError::SettlementAlreadyProcessed,
    )]
    pub prediction_pool: Account<'info, PredictionPool>,

    /// Vault holding all spectator bets. PDA-owned by prediction_pool.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_VAULT_SEED, prediction_pool.key().as_ref()],
        bump,
    )]
    pub prediction_pool_vault: Box<Account<'info, TokenAccount>>,

    /// Match winner's ATA. In a draw, this is the White player's ATA.
    #[account(
        mut,
        constraint = match_winner_ata.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub match_winner_ata: Box<Account<'info, TokenAccount>>,

    /// Match loser's ATA. In a draw, this is the Black player's ATA.
    #[account(
        mut,
        constraint = match_loser_ata.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub match_loser_ata: Box<Account<'info, TokenAccount>>,

    /// Platform fee ATA. Must be owned by the platform_fee_wallet from ChessMatch.
    #[account(
        mut,
        constraint = platform_fee_ata.mint == chess_match.betting_token_mint @ ChessError::PlatformTokenAccountError,
        constraint = platform_fee_ata.owner == chess_match.platform_fee_wallet @ ChessError::InvalidPlatformFeeWallet,
    )]
    pub platform_fee_ata: Box<Account<'info, TokenAccount>>,

    /// Permissionless — fee payer triggers settlement.
    /// CHECK: Only used to pay for the transaction, no data read.
    #[account(mut)]
    pub caller: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_settle_prediction_pool(ctx: Context<SettlePredictionPool>) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;

    // Read pool fields BEFORE mutable borrow (needed for CPI authority later)
    let pool_bump = ctx.accounts.prediction_pool.bump;
    let pool_match_id = ctx.accounts.prediction_pool.match_id.clone();
    let total_bet_white = ctx.accounts.prediction_pool.total_bet_on_white;
    let total_bet_black = ctx.accounts.prediction_pool.total_bet_on_black;
    let total_bet_draw = ctx.accounts.prediction_pool.total_bet_on_draw;

    let winning_outcome: u8 = match chess_match.game_status {
        GameStatus::WhiteWins => 0,
        GameStatus::BlackWins => 1,
        GameStatus::Draw => 2,
        _ => return err!(ChessError::GameNotConcluded),
    };

    let total_pool = total_bet_white
        .checked_add(total_bet_black)
        .ok_or(ChessError::MathError)?
        .checked_add(total_bet_draw)
        .ok_or(ChessError::MathError)?;

    let winning_pool_total = match winning_outcome {
        0 => total_bet_white,
        1 => total_bet_black,
        2 => total_bet_draw,
        _ => return err!(ChessError::InvalidOutcome),
    };

    // Re-entrancy guard: mark settled BEFORE any token transfers
    let prediction_pool = &mut ctx.accounts.prediction_pool;
    prediction_pool.settlement_processed = true;

    // PDA signer seeds for the prediction_pool as vault authority
    let seeds = &[
        PREDICTION_POOL_SEED,
        chess_match.match_id.as_bytes(),
        &[pool_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    if winning_pool_total == 0 {
        // ── Nobody bet on the correct outcome ──
        // Split entire pool: 50% match winner, 25% match loser, 25% platform.
        let winner_share = (total_pool as u128)
            .checked_mul(5_000u128)  // 50%
            .ok_or(ChessError::MathError)?
            .checked_div(PLATFORM_FEE_MAX_BPS as u128)
            .ok_or(ChessError::MathError)? as u64;

        let loser_share = (total_pool as u128)
            .checked_mul(2_500u128)  // 25%
            .ok_or(ChessError::MathError)?
            .checked_div(PLATFORM_FEE_MAX_BPS as u128)
            .ok_or(ChessError::MathError)? as u64;

        let platform_share = total_pool
            .checked_sub(winner_share)
            .ok_or(ChessError::MathError)?
            .checked_sub(loser_share)
            .ok_or(ChessError::MathError)?;

        // In a draw with no winning bets, split 50/50 between both players.
        let (to_player_a, to_player_b) = if chess_match.game_status == GameStatus::Draw {
            let each = (winner_share as u128)
                .checked_add(loser_share as u128)
                .ok_or(ChessError::MathError)?
                .checked_div(2)
                .ok_or(ChessError::MathError)? as u64;
            (each, each)
        } else {
            (winner_share, loser_share)
        };

        if to_player_a > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.prediction_pool_vault.to_account_info(),
                        to: ctx.accounts.match_winner_ata.to_account_info(),
                        authority: prediction_pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                to_player_a,
            )?;
        }
        if to_player_b > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.prediction_pool_vault.to_account_info(),
                        to: ctx.accounts.match_loser_ata.to_account_info(),
                        authority: prediction_pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                to_player_b,
            )?;
        }
        if platform_share > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.prediction_pool_vault.to_account_info(),
                        to: ctx.accounts.platform_fee_ata.to_account_info(),
                        authority: prediction_pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                platform_share,
            )?;
        }

        msg!(
            "Prediction pool settled with NO winning bets. Total {} split: winner={}, loser={}, platform={}",
            total_pool, to_player_a, to_player_b, platform_share,
        );
    } else {
        // ── Normal case: some bettors predicted correctly ──
        let losing_pool = total_pool
            .checked_sub(winning_pool_total)
            .ok_or(ChessError::MathError)?;

        if losing_pool > 0 {
            let match_winner_share = (losing_pool as u128)
                .checked_mul(PREDICTION_MATCH_WINNER_SHARE_BPS as u128)
                .ok_or(ChessError::MathError)?
                .checked_div(PLATFORM_FEE_MAX_BPS as u128)
                .ok_or(ChessError::MathError)? as u64;

            let platform_share = (losing_pool as u128)
                .checked_mul(PREDICTION_PLATFORM_SHARE_BPS as u128)
                .ok_or(ChessError::MathError)?
                .checked_div(PLATFORM_FEE_MAX_BPS as u128)
                .ok_or(ChessError::MathError)? as u64;

            // Draw: split the combined 15% (10%+5%) equally between both players (7.5% each).
            let (to_winner, to_loser) = if chess_match.game_status == GameStatus::Draw {
                let combined = (losing_pool as u128)
                    .checked_mul(
                        (PREDICTION_MATCH_WINNER_SHARE_BPS + PREDICTION_MATCH_LOSER_SHARE_BPS) as u128,
                    )
                    .ok_or(ChessError::MathError)?
                    .checked_div(PLATFORM_FEE_MAX_BPS as u128)
                    .ok_or(ChessError::MathError)? as u64;
                let each = combined / 2;
                (each, combined - each)
            } else {
                let loser_share = (losing_pool as u128)
                    .checked_mul(PREDICTION_MATCH_LOSER_SHARE_BPS as u128)
                    .ok_or(ChessError::MathError)?
                    .checked_div(PLATFORM_FEE_MAX_BPS as u128)
                    .ok_or(ChessError::MathError)? as u64;
                (match_winner_share, loser_share)
            };

            if to_winner > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.prediction_pool_vault.to_account_info(),
                            to: ctx.accounts.match_winner_ata.to_account_info(),
                            authority: prediction_pool.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    to_winner,
                )?;
            }
            if to_loser > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.prediction_pool_vault.to_account_info(),
                            to: ctx.accounts.match_loser_ata.to_account_info(),
                            authority: prediction_pool.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    to_loser,
                )?;
            }
            if platform_share > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.prediction_pool_vault.to_account_info(),
                            to: ctx.accounts.platform_fee_ata.to_account_info(),
                            authority: prediction_pool.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    platform_share,
                )?;
            }
        }
        // If losing_pool == 0: nothing to split — winners just get their bet back on claim.

        msg!(
            "Prediction pool settled for match: {}. Winning outcome: {}, Losing pool: {}",
            pool_match_id,
            winning_outcome,
            losing_pool,
        );
    }

    Ok(())
}
