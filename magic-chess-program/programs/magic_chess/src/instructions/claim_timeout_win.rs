// src/instructions/claim_timeout_win.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*; // Ensure GameEndedEvent is defined here
use crate::state::*;  // Ensure ChessMatch, GameStatus, PlayerColor, GameEndReason are here

use super::schedule_timeout;

#[derive(Accounts)]
pub struct ClaimTimeoutWin<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()], // Assumes chess_match.match_id is String
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)] // Signer is mutable due to transaction fees
    pub claimer_signer: Signer<'info>, // The player claiming the timeout win
}

pub fn handle_claim_timeout_win(ctx: Context<ClaimTimeoutWin>) -> Result<()> {
    let chess_match_key = ctx.accounts.chess_match.key();
    let chess_match = &mut ctx.accounts.chess_match;
    let claimer_key = ctx.accounts.claimer_signer.key();
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // 1. Ensure game is active.
    require!(
        chess_match.game_status == GameStatus::Active,
        ChessError::GameNotActive // Or "CannotClaimTimeoutForNonActiveGame"
    );

    // 2. Ensure claimer is one of the players.
    let claimer_color: PlayerColor;
    let opponent_color: PlayerColor;
    let opponent_player_key: Pubkey; // Key of the player whose turn it was (the one who might have timed out)

    if claimer_key == chess_match.players[0] { // Claimer is Player 1 (White)
        claimer_color = PlayerColor::White;
        opponent_color = PlayerColor::Black;
        opponent_player_key = chess_match.players[1];
    } else if claimer_key == chess_match.players[1] { // Claimer is Player 2 (Black)
        claimer_color = PlayerColor::Black;
        opponent_color = PlayerColor::White;
        opponent_player_key = chess_match.players[0];
    } else {
        return err!(ChessError::NotAPlayer); // Claimer is not part of this match
    }
    
    // Ensure opponent has actually joined
    require!(opponent_player_key != Pubkey::default(), ChessError::OpponentNotJoinedYet);


    // 3. Ensure it was the opponent's turn.
    require!(
        chess_match.current_turn == opponent_color,
        ChessError::NotOpponentsTurnToClaimTimeout // New Error: "Cannot claim timeout if it's your turn"
    );

    // 4. Check if opponent has timed out.
    require!(
        chess_match.move_timeout_duration > 0, 
        ChessError::TimeoutNotConfigured // New Error: "Move timeout is not configured for this match"
    );

    let time_since_last_move = now.saturating_sub(chess_match.last_move_timestamp);
    require!(
        time_since_last_move > chess_match.move_timeout_duration,
        ChessError::OpponentNotTimedOut // Or a more specific "TimeoutThresholdNotReached"
    );

    // 5. Opponent has timed out. Claimer wins.
    chess_match.game_status = match claimer_color {
        PlayerColor::White => GameStatus::WhiteWins,
        PlayerColor::Black => GameStatus::BlackWins,
    };
    chess_match.game_end_reason = Some(GameEndReason::Timeout);
    chess_match.last_move_timestamp = now; // Record time of game end due to timeout claim

    msg!("Player {:?} ({:?}) timed out. Player {:?} ({:?}) wins by timeout claim.", 
        opponent_player_key,
        opponent_color, 
        claimer_key,
        claimer_color
    );

    // 6. Emit GameEndedEvent.
    emit!(GameEndedEvent {
        match_id: chess_match.match_id.clone(), // Assuming match_id in ChessMatch is String
        status: chess_match.game_status,
        winner: Some(claimer_color), // The claimer wins
        reason: GameEndReason::Timeout,
    });

    // 7. Cancel any active timeout task (game is over, no longer needed)
    if chess_match.active_task_id >= 0 {
        schedule_timeout::invoke_cancel_task(
            chess_match.active_task_id,
            &ctx.accounts.claimer_signer.to_account_info(),
        )?;
        chess_match.active_task_id = -1;
    }

    // 8. Schedule process_match_settlement crank task (fires in 5 seconds)
    let base_id = i64::from_le_bytes(chess_match_key.as_ref()[..8].try_into().unwrap());
    let settlement_task_id = base_id.wrapping_add(10_000); // Offset for settlement tasks

    schedule_timeout::invoke_schedule_task(
        settlement_task_id,
        5_000, // 5-second delay
        1,     // Fire once
        &ctx.accounts.claimer_signer.to_account_info(),
    )?;

    // 9. Schedule undelegation task to fire after settlement completes.
    // Settlement fires in 5s; undelegation fires in 10s to ensure it runs after.
    let undelegation_task_id = base_id.wrapping_add(20_000); // Offset for undelegation tasks

    schedule_timeout::invoke_schedule_task(
        undelegation_task_id,
        10_000, // 10-second delay (settlement fires at 5s, this fires 5s later)
        1,      // Fire once
        &ctx.accounts.claimer_signer.to_account_info(),
    )?;

    msg!(
        "Settlement task {} and undelegation task {} scheduled for match {}",
        settlement_task_id,
        undelegation_task_id,
        chess_match.match_id
    );

    Ok(())
}
