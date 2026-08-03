// src/instructions/settle_prediction_pool.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, GameStatus, PredictionPool};

#[derive(Accounts)]
pub struct SettlePredictionPool<'info> {
    /// The ChessMatch — its game_status serves as the oracle.
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

    /// The PredictionPool to settle.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump = prediction_pool.bump,
        constraint = !prediction_pool.settlement_processed @ ChessError::SettlementAlreadyProcessed,
    )]
    pub prediction_pool: Account<'info, PredictionPool>,

    /// Any signer can call settlement (permissionless).
    #[account(mut)]
    pub caller: Signer<'info>,
}

pub fn handle_settle_prediction_pool(ctx: Context<SettlePredictionPool>) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;
    let prediction_pool = &mut ctx.accounts.prediction_pool;

    // Determine winning outcome from game status (on-chain oracle).
    let _winning_outcome: u8 = match chess_match.game_status {
        GameStatus::WhiteWins => 0,
        GameStatus::BlackWins => 1,
        GameStatus::Draw => 2,
        _ => return err!(ChessError::GameNotConcluded),
    };

    // Mark settlement as processed. Winners now claim via pull model.
    prediction_pool.settlement_processed = true;

    msg!(
        "Prediction pool settled for match: {}. Winning outcome: {}",
        prediction_pool.match_id,
        _winning_outcome,
    );
    Ok(())
}
