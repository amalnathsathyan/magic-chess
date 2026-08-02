// src/instructions/revoke_session_key.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::*;

#[derive(Accounts)]
pub struct RevokeSessionKey<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,
    pub player: Signer<'info>,
}

pub fn handle_revoke_session_key(ctx: Context<RevokeSessionKey>) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let player = ctx.accounts.player.key();

    require!(
        player == chess_match.players[0] || player == chess_match.players[1],
        ChessError::UnauthorizedSigner
    );

    chess_match.session_signer = Pubkey::default();
    chess_match.session_expires_at = 0;

    msg!("Session key revoked for match {}", chess_match.match_id);
    Ok(())
}
