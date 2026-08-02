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
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

pub fn handle_close_match(ctx: Context<CloseMatch>) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;

    msg!("Closing chess_match PDA for match: {}", chess_match.match_id);

    // Emit MatchClosedEvent before the account is closed (data is still readable)
    emit!(MatchClosedEvent {
        match_id: chess_match.match_id.clone(),
    });

    // Anchor's close constraint handles the rest:
    // - Transfers lamports from chess_match PDA to payer
    // - Zeroes out the account data

    msg!("Match closed: {}", chess_match.match_id);
    Ok(())
}
