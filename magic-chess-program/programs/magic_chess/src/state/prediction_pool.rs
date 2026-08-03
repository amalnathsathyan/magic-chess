// src/state/prediction_pool.rs
use crate::constants::*;
use anchor_lang::prelude::*;

/// Pools all prediction bets for a single chess match.
/// Parimutuel model — winners split the losing pool proportionally.
#[account]
#[derive(InitSpace, Debug)]
pub struct PredictionPool {
    #[max_len(MAX_MATCH_ID_LEN)]
    pub match_id: String,
    pub chess_match: Pubkey,        // The ChessMatch PDA this pool tracks
    pub total_bet_on_white: u64,
    pub total_bet_on_black: u64,
    pub total_bet_on_draw: u64,
    pub platform_fee_bps: u16,      // Basis points taken from losing pool
    pub settlement_processed: bool, // True after settle_prediction_pool is called
    pub bump: u8,
}

/// One bettor's prediction on a match.
/// Pull-model: payout is claimed individually via claim_prediction_winnings.
#[account]
#[derive(InitSpace, Debug)]
pub struct PredictionBet {
    pub bettor: Pubkey,
    pub pool: Pubkey,               // PredictionPool PDA this bet belongs to
    pub amount: u64,
    pub predicted_outcome: u8,      // 0 = White, 1 = Black, 2 = Draw
    pub claimed: bool,              // True after claim or cancel
    pub bump: u8,
}
