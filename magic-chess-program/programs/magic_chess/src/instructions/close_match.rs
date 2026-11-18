// src/instructions/close_match.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::ChessMatch;

#[derive(Accounts)]
pub struct CloseMatch<'info> {
    #[account(
        mut,
        close = payer,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = chess_match.payout_processed @ ChessError::MatchNotSettled,
        // The rent goes to `payer`, so not just anyone may close a match.
        constraint = (
            payer.key() == chess_match.players[0] ||
            payer.key() == chess_match.players[1] ||
            payer.key() == PLATFORM_FEE_WALLET
        ) @ ChessError::UnauthorizedSigner,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    /// A player of the match or the platform fee wallet; receives the rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The match's prediction pool address. Settling, claiming and cancelling
    /// a prediction all read the match account, and a closed match id can be
    /// created again, which would let an old pool be claimed against a new
    /// game. So a match that has a pool is never closed.
    /// CHECK: only its owner is read; the address is pinned by the seeds.
    #[account(
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump,
    )]
    pub prediction_pool: UncheckedAccount<'info>,
}

pub fn handle_close_match(ctx: Context<CloseMatch>) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;

    require!(
        ctx.accounts.prediction_pool.owner != ctx.program_id,
        ChessError::PredictionPoolExists
    );

    // Emit MatchClosedEvent before the account is closed (data is still readable)
    emit!(MatchClosedEvent {
        match_id: chess_match.match_id.clone(),
    });

    // Anchor's close constraint handles the rest:
    // - Transfers lamports from chess_match PDA to payer
    // - Zeroes out the account data

    Ok(())
}
