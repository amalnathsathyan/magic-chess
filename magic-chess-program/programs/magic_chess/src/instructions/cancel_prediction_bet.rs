// src/instructions/cancel_prediction_bet.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, GameStatus, PredictionBet, PredictionPool};

#[derive(Accounts)]
pub struct CancelPredictionBet<'info> {
    /// The ChessMatch — must be WaitingForOpponent or Aborted, or be settled with no winners.
    #[account(
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    /// The PredictionPool.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump = prediction_pool.bump,
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
        close = bettor,
    )]
    pub prediction_bet: Account<'info, PredictionBet>,

    /// Vault token account for the prediction pool.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_VAULT_SEED, prediction_pool.key().as_ref()],
        bump,
    )]
    pub prediction_pool_vault: Box<Account<'info, TokenAccount>>,

    /// The bettor's token account (destination for refund).
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

pub fn handle_cancel_prediction_bet(ctx: Context<CancelPredictionBet>) -> Result<()> {
    let prediction_pool = &mut ctx.accounts.prediction_pool;
    let prediction_bet = &ctx.accounts.prediction_bet;
    let chess_match = &ctx.accounts.chess_match;

    let can_cancel = chess_match.game_status == GameStatus::WaitingForOpponent
        || chess_match.game_status == GameStatus::Aborted
        || (chess_match.game_status == GameStatus::WhiteWins && prediction_pool.total_bet_on_white == 0)
        || (chess_match.game_status == GameStatus::BlackWins && prediction_pool.total_bet_on_black == 0)
        || (chess_match.game_status == GameStatus::Draw && prediction_pool.total_bet_on_draw == 0);

    require!(can_cancel, ChessError::CannotCancelActiveMatch);

    let refund_amount = prediction_bet.amount;

    // Defense-in-depth: verify vault has sufficient balance before transfer
    require!(
        ctx.accounts.prediction_pool_vault.amount >= refund_amount,
        ChessError::MathError
    );

    // Update pool totals based on which outcome was bet on
    match prediction_bet.predicted_outcome {
        0 => {
            prediction_pool.total_bet_on_white = prediction_pool
                .total_bet_on_white
                .checked_sub(refund_amount)
                .ok_or(ChessError::MathError)?;
        }
        1 => {
            prediction_pool.total_bet_on_black = prediction_pool
                .total_bet_on_black
                .checked_sub(refund_amount)
                .ok_or(ChessError::MathError)?;
        }
        2 => {
            prediction_pool.total_bet_on_draw = prediction_pool
                .total_bet_on_draw
                .checked_sub(refund_amount)
                .ok_or(ChessError::MathError)?;
        }
        _ => return err!(ChessError::InvalidOutcome),
    }

    // Transfer refund from pool vault back to bettor
    // Use PDA signer seeds for the prediction_pool as authority
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
    token::transfer(cpi_ctx, refund_amount)?;

    msg!(
        "Canceled prediction bet: bettor={}, amount={}",
        prediction_bet.bettor,
        refund_amount,
    );

    // prediction_bet account is closed via the `close = bettor` constraint
    Ok(())
}
