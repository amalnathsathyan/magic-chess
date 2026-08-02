// src/instructions/set_session_key.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::*;

#[derive(Accounts)]
pub struct SetSessionKey<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,
    /// Must be one of the two players
    pub player: Signer<'info>,
}

pub fn handle_set_session_key(
    ctx: Context<SetSessionKey>,
    session_signer: Pubkey,
    expires_at: i64,
) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let player = ctx.accounts.player.key();

    // Only players in this match can set session keys
    require!(
        player == chess_match.players[0] || player == chess_match.players[1],
        ChessError::UnauthorizedSigner
    );

    // Session expiry must be in the future
    let clock = Clock::get()?;
    require!(
        expires_at > clock.unix_timestamp,
        ChessError::InvalidSession
    );

    chess_match.session_signer = session_signer;
    chess_match.session_expires_at = expires_at;

    msg!("Session key set for match {}", chess_match.match_id);
    Ok(())
}
