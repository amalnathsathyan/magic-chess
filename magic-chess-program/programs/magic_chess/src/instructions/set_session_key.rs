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
    /// Must be one of the two players — determines which color's session is set.
    pub player: Signer<'info>,
}

pub fn handle_set_session_key(
    ctx: Context<SetSessionKey>,
    session_signer: Pubkey,
    expires_at: i64,
) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let player = ctx.accounts.player.key();

    // Determine which color this player is, then bind session key to that color.
    let is_white = player == chess_match.players[0];
    let is_black = player == chess_match.players[1];
    require!(is_white || is_black, ChessError::UnauthorizedSigner);
    require!(is_white != is_black, ChessError::DuplicateAccounts); // belt-and-suspenders

    // Session expiry must be in the future
    let clock = Clock::get()?;
    require!(
        expires_at > clock.unix_timestamp,
        ChessError::InvalidSession
    );

    if is_white {
        chess_match.white_session_signer = session_signer;
        chess_match.white_session_expires_at = expires_at;
    } else {
        chess_match.black_session_signer = session_signer;
        chess_match.black_session_expires_at = expires_at;
    }

    msg!(
        "Session key set for match {} player {:?}",
        chess_match.match_id,
        if is_white { PlayerColor::White } else { PlayerColor::Black }
    );
    Ok(())
}
