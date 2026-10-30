// src/instructions/claim_timeout_win.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ClaimTimeoutWin<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub claimer_signer: Signer<'info>,
}

pub fn handle_claim_timeout_win(ctx: Context<ClaimTimeoutWin>) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let claimer_key = ctx.accounts.claimer_signer.key();
    let now = Clock::get()?.unix_timestamp;

    // 1. Ensure game is active.
    require!(
        chess_match.game_status == GameStatus::Active,
        ChessError::GameNotActive
    );

    // 2. The claimer must be a player. The winner is derived from the
    // claimer's seat, the loser from whose turn it is; the signer never picks.
    let (claimer_color, opponent_color, opponent_player_key) = if claimer_key == chess_match.players[0] {
        (PlayerColor::White, PlayerColor::Black, chess_match.players[1])
    } else if claimer_key == chess_match.players[1] {
        (PlayerColor::Black, PlayerColor::White, chess_match.players[0])
    } else {
        return err!(ChessError::NotAPlayer);
    };
    require!(opponent_player_key != Pubkey::default(), ChessError::OpponentNotJoinedYet);

    // 3. Only the side waiting for a move can claim.
    require!(
        chess_match.current_turn == opponent_color,
        ChessError::NotOpponentsTurnToClaimTimeout
    );

    // 4. The clock must have run out.
    require!(
        chess_match.move_timeout_duration > 0,
        ChessError::TimeoutNotConfigured
    );
    let time_since_last_move = now.saturating_sub(chess_match.last_move_timestamp);
    require!(
        time_since_last_move > chess_match.move_timeout_duration,
        ChessError::OpponentNotTimedOut
    );

    // 5. Claimer wins.
    chess_match.game_status = match claimer_color {
        PlayerColor::White => GameStatus::WhiteWins,
        PlayerColor::Black => GameStatus::BlackWins,
    };
    chess_match.game_end_reason = Some(GameEndReason::Timeout);
    chess_match.last_move_timestamp = now;

    emit!(GameEndedEvent {
        match_id: chess_match.match_id.clone(),
        status: chess_match.game_status,
        winner: Some(claimer_color),
        reason: GameEndReason::Timeout,
    });

    // Settlement is not automatic: a player (or the backend) undelegates
    // and calls process_match_settlement on the base layer.
    Ok(())
}
