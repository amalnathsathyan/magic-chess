// src/instructions/make_move.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;
use crate::utils::chess_logic;

use super::schedule_timeout;

#[derive(Accounts)]
#[instruction(args: MakeMoveArgs)]
pub struct MakeMove<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MakeMoveArgs {
    pub from_row: u8,
    pub from_col: u8,
    pub to_row: u8,
    pub to_col: u8,
    pub promotion: Option<PieceType>, // Ensure PieceType is correctly imported/namespaced
}

pub fn handle_make_move(ctx: Context<MakeMove>, args: MakeMoveArgs) -> Result<()> {
    let chess_match_key = ctx.accounts.chess_match.key();
    let chess_match = &mut ctx.accounts.chess_match;
    let player_key = ctx.accounts.player.key();
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // 1. Ensure game is active
    require!(
        chess_match.game_status == GameStatus::Active,
        ChessError::GameNotActive
    );

    // 2. Determine current player and verify signer (wallet or session key)
    let expected_player_key_for_turn = if chess_match.current_turn == PlayerColor::White {
        chess_match.players[0] // Assuming players[0] is White
    } else {
        chess_match.players[1] // Assuming players[1] is Black
    };

    // Authorization: signer must be the actual player OR a valid session key
    let is_authorized_player = player_key == expected_player_key_for_turn;
    let is_valid_session = chess_match.session_signer != Pubkey::default()
        && player_key == chess_match.session_signer
        && now < chess_match.session_expires_at;

    require!(
        is_authorized_player || is_valid_session,
        ChessError::UnauthorizedSigner
    );

    let player_color_making_move = chess_match.current_turn; // Color of the player making the move

    // 3. Check move timeout (if move_timeout_duration is set > 0)
    if chess_match.move_timeout_duration > 0 {
        if now.saturating_sub(chess_match.last_move_timestamp) > chess_match.move_timeout_duration {
            chess_match.game_status = match player_color_making_move {
                PlayerColor::White => GameStatus::BlackWins,
                PlayerColor::Black => GameStatus::WhiteWins,
            };
            chess_match.game_end_reason = Some(GameEndReason::Timeout);
            chess_match.last_move_timestamp = now; // Update timestamp for game end

            emit!(GameEndedEvent {
                match_id: chess_match.match_id.clone(), // Assuming match_id in ChessMatch state is String
                status: chess_match.game_status,
                winner: Some(player_color_making_move.opponent()),
                reason: GameEndReason::Timeout,
            });
            msg!("Player {:?} timed out. Opponent {:?} wins.", player_color_making_move, player_color_making_move.opponent());
            return Ok(());
        }
    }

    // 4. Call the core chess logic (Bounds checks are handled inside chess_logic)
    msg!("Calling validate_and_apply_move for player: {:?}", player_color_making_move);
    msg!("Move: ({},{}) to ({},{}) promo: {:?}", args.from_row, args.from_col, args.to_row, args.to_col, args.promotion);
    
    // CORRECTED CALL: Pass the mutable chess_match account directly
    let move_result = chess_logic::validate_and_apply_move(
        chess_match, // Pass the whole mutable ChessMatch state
        args.from_row,
        args.from_col,
        args.to_row,
        args.to_col,
        player_color_making_move, // Pass the color of the current player
        args.promotion,
    )?;
    msg!("Move result: {:?}", move_result);
    // chess_match is now updated by chess_logic::validate_and_apply_move for fields like:
    // board, castling_rights, en_passant_target, halfmove_clock, fullmove_number, current_turn.

    // 5. Update game state based on move_result (primarily setting game_status and player_idx)
    match move_result {
        MoveResult::Normal => {
            // current_turn was already updated by chess_logic.
            // Update current_player_idx to match the new current_turn.
            chess_match.current_player_idx = if chess_match.current_turn == PlayerColor::White { 0 } else { 1 };
            chess_match.last_move_timestamp = now;
        }
        MoveResult::Checkmate => {
            // player_color_making_move is the winner
            chess_match.game_status = if player_color_making_move == PlayerColor::White {
                GameStatus::WhiteWins
            } else {
                GameStatus::BlackWins
            };
            chess_match.game_end_reason = Some(GameEndReason::Checkmate);
            chess_match.last_move_timestamp = now; // Record time of game-ending move

            emit!(GameEndedEvent {
                match_id: chess_match.match_id.clone(), // Assuming String
                status: chess_match.game_status,
                winner: Some(player_color_making_move),
                reason: GameEndReason::Checkmate,
            });
        }
        MoveResult::Stalemate => {
            chess_match.game_status = GameStatus::Draw;
            // chess_logic already updated halfmove_clock. Check it here for reason.
            if chess_match.halfmove_clock >= 100 {
                 chess_match.game_end_reason = Some(GameEndReason::FiftyMoveRule);
            } else {
                 chess_match.game_end_reason = Some(GameEndReason::Stalemate);
            }
            chess_match.last_move_timestamp = now; // Record time of game-ending move

            emit!(GameEndedEvent {
                match_id: chess_match.match_id.clone(), // Assuming String
                status: chess_match.game_status,
                winner: None, // No winner in a draw
                reason: chess_match.game_end_reason.unwrap(), // We just set it
            });
        }
        MoveResult::ThreefoldRepetition => {
            chess_match.game_status = GameStatus::Draw;
            chess_match.game_end_reason = Some(GameEndReason::ThreefoldRepetition);
            chess_match.last_move_timestamp = now;

            emit!(GameEndedEvent {
                match_id: chess_match.match_id.clone(),
                status: chess_match.game_status,
                winner: None,
                reason: GameEndReason::ThreefoldRepetition,
            });
        }
    }

    // 6. Emit MoveMadeEvent
    let from_sq = format!("{}{}", (b'a' + args.from_col) as char, args.from_row + 1);
    let to_sq = format!("{}{}", (b'a' + args.to_col) as char, args.to_row + 1);
    let promo_char_str = match args.promotion { // Renamed for clarity
        Some(PieceType::Queen) => "q", Some(PieceType::Rook) => "r",
        Some(PieceType::Bishop) => "b", Some(PieceType::Knight) => "n",
        _ => "",
    };
    let algebraic_move_string = format!("{}{}{}", from_sq, to_sq, promo_char_str);

    emit!(MoveMadeEvent {
        match_id: chess_match.match_id.clone(), // Assuming String
        player: player_key,
        player_color: player_color_making_move, // The color that just moved
        algebraic_move: algebraic_move_string,
        from_row: args.from_row,
        from_col: args.from_col,
        to_row: args.to_row,
        to_col: args.to_col,
        promotion_piece: args.promotion,
        board_fen: chess_logic::generate_fen(chess_match),
        // Check status for the *next* player (whose turn it is now, after chess_logic updated current_turn)
        is_check: if chess_match.game_status == GameStatus::Active { 
            chess_logic::is_king_in_check(&chess_match.board, chess_match.current_turn)
        } else { false },
        is_checkmate: move_result == MoveResult::Checkmate,
        is_stalemate: move_result == MoveResult::Stalemate,
    });

    // 7. Schedule timeout crank task for opponent if game is still active
    if chess_match.game_status == GameStatus::Active && chess_match.move_timeout_duration > 0 {
        // Cancel previous task (opponent's now-obsolete timeout)
        if chess_match.active_task_id >= 0 {
            schedule_timeout::invoke_cancel_task(
                chess_match.active_task_id,
                &ctx.accounts.player.to_account_info(),
            )?;
        }

        // Generate unique task_id from match account key + move counter
        let base_id = i64::from_le_bytes(chess_match_key.as_ref()[..8].try_into().unwrap());
        let new_task_id = base_id.wrapping_add(chess_match.fullmove_number as i64 * 2);
        let timeout_ms = chess_match.move_timeout_duration.checked_mul(1000).unwrap_or(0);

        schedule_timeout::invoke_schedule_task(
            new_task_id,
            timeout_ms,
            1,
            &ctx.accounts.player.to_account_info(),
        )?;

        chess_match.active_task_id = new_task_id;
    }

    Ok(())
}
