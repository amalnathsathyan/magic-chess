// src/instructions/make_move.rs
use anchor_lang::prelude::*;
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;
use crate::utils::chess_logic;

#[derive(Accounts, Session)]
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

    #[session(
        signer = player,
        authority = chess_match.current_player_key()
    )]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MakeMoveArgs {
    pub from_row: u8,
    pub from_col: u8,
    pub to_row: u8,
    pub to_col: u8,
    pub promotion: Option<PieceType>,
}

/// Who won and why, for the game-end bookkeeping shared by every terminal move.
fn end_game(chess_match: &mut ChessMatch, status: GameStatus, reason: GameEndReason, winner: Option<PlayerColor>, now: i64) {
    chess_match.game_status = status;
    chess_match.game_end_reason = Some(reason);
    chess_match.last_move_timestamp = now;
    emit!(GameEndedEvent {
        match_id: chess_match.match_id.clone(),
        status,
        winner,
        reason,
    });
}

#[session_auth_or(
    ctx.accounts.chess_match.is_authorized_move_signer(
        ctx.accounts.player.key(),
        Clock::get()?.unix_timestamp,
    ),
    ChessError::UnauthorizedSigner
)]
pub fn handle_make_move(ctx: Context<MakeMove>, args: MakeMoveArgs) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let now = Clock::get()?.unix_timestamp;

    // 1. Ensure game is active
    require!(
        chess_match.game_status == GameStatus::Active,
        ChessError::GameNotActive
    );

    // 2. Wallet/session authorization is enforced by `session_auth_or` above.
    // It accepts the current player's wallet, the match's registered
    // unexpired fast-play signer, or a valid SessionTokenV2 bound to the
    // current player's wallet.
    let player_authority = chess_match.current_player_key();
    let mover = chess_match.current_turn;

    // 3. A move that arrives after the clock ran out loses on time instead.
    if chess_match.move_timeout_duration > 0
        && now.saturating_sub(chess_match.last_move_timestamp) > chess_match.move_timeout_duration
    {
        let status = match mover {
            PlayerColor::White => GameStatus::BlackWins,
            PlayerColor::Black => GameStatus::WhiteWins,
        };
        end_game(chess_match, status, GameEndReason::Timeout, Some(mover.opponent()), now);
        return Ok(());
    }

    // 4. Validate and apply the move. Bounds and rules live in chess_logic;
    // it updates board, castling rights, en passant, clocks and the turn.
    let move_result = chess_logic::validate_and_apply_move(
        chess_match,
        args.from_row,
        args.from_col,
        args.to_row,
        args.to_col,
        mover,
        args.promotion,
    )?;

    // 5. Game status after the move.
    match move_result {
        MoveResult::Normal => {
            chess_match.current_player_idx = if chess_match.current_turn == PlayerColor::White { 0 } else { 1 };
            chess_match.last_move_timestamp = now;
        }
        MoveResult::Checkmate => {
            let status = if mover == PlayerColor::White { GameStatus::WhiteWins } else { GameStatus::BlackWins };
            end_game(chess_match, status, GameEndReason::Checkmate, Some(mover), now);
        }
        MoveResult::Stalemate => end_game(chess_match, GameStatus::Draw, GameEndReason::Stalemate, None, now),
        MoveResult::FiftyMoveRule => end_game(chess_match, GameStatus::Draw, GameEndReason::FiftyMoveRule, None, now),
        MoveResult::InsufficientMaterial => {
            end_game(chess_match, GameStatus::Draw, GameEndReason::InsufficientMaterial, None, now)
        }
        MoveResult::ThreefoldRepetition => {
            end_game(chess_match, GameStatus::Draw, GameEndReason::ThreefoldRepetition, None, now)
        }
    }

    // 6. Emit MoveMadeEvent. The indexer reads the move and the FEN from it.
    let promo_char = match args.promotion {
        Some(PieceType::Queen) => "q",
        Some(PieceType::Rook) => "r",
        Some(PieceType::Bishop) => "b",
        Some(PieceType::Knight) => "n",
        _ => "",
    };
    let algebraic_move_string = format!(
        "{}{}{}{}{}",
        (b'a' + args.from_col) as char,
        args.from_row + 1,
        (b'a' + args.to_col) as char,
        args.to_row + 1,
        promo_char
    );
    let game_over = move_result != MoveResult::Normal;

    emit!(MoveMadeEvent {
        match_id: chess_match.match_id.clone(),
        // Attribute the move to the player's wallet, never the temporary key.
        player: player_authority,
        player_color: mover,
        algebraic_move: algebraic_move_string,
        from_row: args.from_row,
        from_col: args.from_col,
        to_row: args.to_row,
        to_col: args.to_col,
        promotion_piece: args.promotion,
        board_fen: chess_logic::generate_fen(chess_match),
        // Check status for the side to move now. A checkmate is reported
        // through is_checkmate; other game-over results leave no check.
        is_check: !game_over && chess_logic::is_king_in_check(&chess_match.board, chess_match.current_turn),
        is_checkmate: move_result == MoveResult::Checkmate,
        is_stalemate: game_over && move_result != MoveResult::Checkmate,
    });

    Ok(())
}
