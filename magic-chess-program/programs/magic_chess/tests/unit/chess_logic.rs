// Unit tests for Magic Chess logic.
// These are pure Rust tests — no Solana VM needed.
//
// Tests the following public API from the magic_chess crate:
//   - chess_logic::initialize_chess_board()
//   - chess_logic::validate_and_apply_move()
//   - chess_logic::is_king_in_check()
//   - chess_logic::is_insufficient_material()
//   - chess_logic::compute_zobrist_hash()
//   - chess_logic::is_threefold_repetition()
//
// Combined from: unit_chess.rs, unit_chess_piece_gaps.rs,
//   unit_chess_castling_endgame.rs, unit_chess_integration_corners.rs

use anchor_lang::prelude::Pubkey;
use magic_chess::state::*;
use magic_chess::utils::chess_logic;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Create a minimal ChessMatch with sensible defaults for testing.
fn make_match(board: [[Option<Piece>; 8]; 8], current_turn: PlayerColor) -> ChessMatch {
    ChessMatch {
        match_id: "test_match".to_string(),
        players: [Pubkey::new_unique(), Pubkey::new_unique()],
        current_player_idx: 0,
        current_turn,
        last_move_timestamp: 0,
        move_timeout_duration: 0,
        game_status: GameStatus::Active,
        game_end_reason: None,
        board,
        castling_rights: CastlingRights::new(),
        en_passant_target: None,
        halfmove_clock: 0,
        fullmove_number: 1,
        position_history: vec![],
        betting_token_mint: Pubkey::new_unique(),
        bet_amount_player_one: 0,
        bet_amount_player_two: 0,
        total_pot: 0,
        platform_fee_basis_points: 0,
        platform_fee_wallet: Pubkey::new_unique(),
        payout_processed: false,
        prediction_enabled: false,
        delegation_uid: String::new(),
        is_delegated: false,
        session_signer: Pubkey::default(),
        session_expires_at: 0,
        active_task_id: -1,
        bump: 0,
        match_escrow_bump: 0,
    }
}

/// Create a ChessMatch using the standard starting board.
fn standard_match(current_turn: PlayerColor) -> ChessMatch {
    make_match(chess_logic::initialize_chess_board(), current_turn)
}

/// Create an 8x8 board with only two kings placed far apart.
fn board_with_kings() -> [[Option<Piece>; 8]; 8] {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board
}

/// Place a piece on a board (returns the modified board).
fn place(
    mut board: [[Option<Piece>; 8]; 8],
    row: usize,
    col: usize,
    piece_type: PieceType,
    color: PlayerColor,
) -> [[Option<Piece>; 8]; 8] {
    board[row][col] = Some(Piece { piece_type, color });
    board
}

// ===========================================================================
// 1. Pawn Movement (12 tests)
// ===========================================================================

#[test]
fn pawn_white_single_advance() {
    let mut game = standard_match(PlayerColor::White);
    // White pawn at (1, 0) -> (2, 0)
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert!(matches!(result.unwrap(), MoveResult::Normal));
    assert_eq!(
        game.board[2][0],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::White,
        })
    );
    assert!(game.board[1][0].is_none());
}

#[test]
fn pawn_white_double_advance() {
    let mut game = standard_match(PlayerColor::White);
    // White pawn at (1, 0) -> (3, 0)
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 3, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert!(matches!(result.unwrap(), MoveResult::Normal));
    assert_eq!(
        game.board[3][0],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::White,
        })
    );
    // En passant target is set to the square the pawn passed through.
    assert_eq!(
        game.en_passant_target,
        Some(EnPassantSquare { row: 2, col: 0 })
    );
}

#[test]
fn pawn_white_blocked_piece_in_front() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Block with a piece of the same colour directly in front.
    board[2][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn pawn_white_blocked_two_squares_ahead() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Block the double-advance target square.
    board[3][0] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 3, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn pawn_white_diagonal_capture() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Opponent piece on the diagonal.
    board[2][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 1, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[2][1],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::White,
        })
    );
    // The captured pawn must be gone.
    assert!(game.board[2][1].is_some());
    // halfmove clock resets on capture.
    assert_eq!(game.halfmove_clock, 0);
}

#[test]
fn pawn_white_en_passant_capture() {
    let mut board = board_with_kings();
    board[4][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Black pawn that just double-advanced — it sits on row 4, col 1.
    board[4][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.en_passant_target = Some(EnPassantSquare { row: 5, col: 1 });

    let result = chess_logic::validate_and_apply_move(
        &mut game, 4, 0, 5, 1, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    // White pawn lands on the en passant square.
    assert_eq!(
        game.board[5][1],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::White,
        })
    );
    // The captured black pawn at (4, 1) must be removed.
    assert!(game.board[4][1].is_none());
}

#[test]
fn pawn_black_single_advance() {
    let mut game = standard_match(PlayerColor::Black);
    // Black pawn at (6, 0) -> (5, 0)
    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 5, 0, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[5][0],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::Black,
        })
    );
}

#[test]
fn pawn_black_double_advance() {
    let mut game = standard_match(PlayerColor::Black);
    // Black pawn at (6, 0) -> (4, 0)
    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 4, 0, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[4][0],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::Black,
        })
    );
    assert_eq!(
        game.en_passant_target,
        Some(EnPassantSquare { row: 5, col: 0 })
    );
}

#[test]
fn pawn_black_diagonal_capture() {
    let mut board = board_with_kings();
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[5][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::Black);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 5, 1, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[5][1],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::Black,
        })
    );
}

#[test]
fn pawn_black_en_passant_capture() {
    let mut board = board_with_kings();
    board[3][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    // White pawn that just double-advanced.
    board[3][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::Black);
    game.en_passant_target = Some(EnPassantSquare { row: 2, col: 1 });

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 2, 1, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[2][1],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::Black,
        })
    );
    // The captured white pawn at (3, 1) must be removed.
    assert!(game.board[3][1].is_none());
}

#[test]
fn pawn_white_promotion() {
    let mut board = board_with_kings();
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 7, 0, PlayerColor::White, Some(PieceType::Queen),
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][0],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn pawn_black_promotion() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::Black);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 0, 0, PlayerColor::Black, Some(PieceType::Rook),
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[0][0],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::Black,
        })
    );
}

// ===========================================================================
// 2. Knight Movement (3 tests)
// ===========================================================================

#[test]
fn knight_l_shape_move() {
    // Use the standard board: white knight at (0, 1) -> (2, 0).
    // In the starting position (2, 0) is empty — it sits in front of the a-pawn
    // and is not occupied.
    let mut game = standard_match(PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[2][0],
        Some(Piece {
            piece_type: PieceType::Knight,
            color: PlayerColor::White,
        })
    );
    assert!(game.board[0][1].is_none());
}

#[test]
fn knight_blocked_by_own_piece() {
    let mut board = board_with_kings();
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    // Own piece on the target square.
    board[2][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn knight_captures_opponent() {
    let mut board = board_with_kings();
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[2][0],
        Some(Piece {
            piece_type: PieceType::Knight,
            color: PlayerColor::White,
        })
    );
}

// ===========================================================================
// 3. Bishop Movement (3 tests)
// ===========================================================================

#[test]
fn bishop_diagonal_clear_path() {
    let mut board = board_with_kings();
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    // Diagonal: (3,3) -> (7,7) — path squares (4,4),(5,5),(6,6) are all empty.
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][7],
        Some(Piece {
            piece_type: PieceType::Bishop,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn bishop_blocked_by_piece() {
    let mut board = board_with_kings();
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    // Block the diagonal at (5, 5).
    board[5][5] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn bishop_captures_opponent() {
    let mut board = board_with_kings();
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][7],
        Some(Piece {
            piece_type: PieceType::Bishop,
            color: PlayerColor::White,
        })
    );
}

// ===========================================================================
// 4. Rook Movement (3 tests)
// ===========================================================================

#[test]
fn rook_clear_path() {
    let mut board = board_with_kings();
    board[3][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    // Horizontal: (3,0) -> (3,7) — path is clear.
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 3, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[3][7],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn rook_blocked() {
    let mut board = board_with_kings();
    board[3][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[3][4] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 3, 7, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn rook_captures_opponent() {
    let mut board = board_with_kings();
    board[3][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[3][7] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 3, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[3][7],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        })
    );
}

// ===========================================================================
// 5. Queen Movement (2 tests)
// ===========================================================================

#[test]
fn queen_diagonal_move() {
    let mut board = board_with_kings();
    board[3][3] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][7],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn queen_horizontal_move() {
    let mut board = board_with_kings();
    board[3][0] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 3, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[3][7],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        })
    );
}

// ===========================================================================
// 6. King Movement (4 tests)
// ===========================================================================

#[test]
fn king_one_square_move() {
    let mut board = board_with_kings();
    // Move the white king one square up.  Black king is far away at (7,4).
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 1, 4, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[1][4],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        })
    );
    // Castling rights are lost after king moves.
    assert!(!game.castling_rights.white_kingside);
    assert!(!game.castling_rights.white_queenside);
}

#[test]
fn king_cannot_move_into_check() {
    let mut board = [[None; 8]; 8];
    // White king at (0, 4), Black rook at (0, 0) — same rank, clear path.
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // (0, 3) is attacked by the rook (same rank). King cannot move there.
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 3, PlayerColor::White, None,
    );
    // The move is legal for the piece type but leaves the king in check.
    assert!(result.is_err());
}

#[test]
fn king_blocked_by_own_piece() {
    let mut board = board_with_kings();
    // Own pawn on the target square.
    board[1][4] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 1, 4, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn king_captures_undefended_piece() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // Undefended black pawn.
    board[1][5] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 1, 5, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[1][5],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        })
    );
}

// ===========================================================================
// 7. Castling (7 tests)
// ===========================================================================

#[test]
fn castling_white_kingside_valid() {
    let mut board = chess_logic::initialize_chess_board();
    // Clear f1 (col 5) and g1 (col 6) so the king can castle.
    board[0][5] = None; // bishop
    board[0][6] = None; // knight
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    // King landed on g1.
    assert_eq!(
        game.board[0][6],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        })
    );
    // Rook landed on f1 (col 5).
    assert_eq!(
        game.board[0][5],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        })
    );
    // Old king and rook squares are empty.
    assert!(game.board[0][4].is_none());
    assert!(game.board[0][7].is_none());
}

#[test]
fn castling_white_queenside_valid() {
    let mut board = chess_logic::initialize_chess_board();
    // Clear d1 (col 3), c1 (col 2), b1 (col 1).
    board[0][3] = None; // queen
    board[0][2] = None; // bishop
    board[0][1] = None; // knight
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 2, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[0][2],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        })
    );
    assert_eq!(
        game.board[0][3],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn castling_black_kingside_valid() {
    let mut board = chess_logic::initialize_chess_board();
    board[7][5] = None; // bishop
    board[7][6] = None; // knight
    let mut game = make_match(board, PlayerColor::Black);
    game.castling_rights.black_kingside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 4, 7, 6, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][6],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::Black,
        })
    );
    assert_eq!(
        game.board[7][5],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::Black,
        })
    );
}

#[test]
fn castling_black_queenside_valid() {
    let mut board = chess_logic::initialize_chess_board();
    board[7][3] = None; // queen
    board[7][2] = None; // bishop
    board[7][1] = None; // knight
    let mut game = make_match(board, PlayerColor::Black);
    game.castling_rights.black_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 4, 7, 2, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][2],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::Black,
        })
    );
    assert_eq!(
        game.board[7][3],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::Black,
        })
    );
}

#[test]
fn castling_blocked_through_check_kingside() {
    // White kingside: clear f1 and g1, but put a black rook that attacks f1.
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // Black rook on same file as f1, clear path — attacks f1 (col 5).
    board[5][5] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn castling_when_king_in_check() {
    // White king is in check by a black rook on the same rank.
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn castling_rights_lost_after_king_moved() {
    let mut board = chess_logic::initialize_chess_board();
    board[0][5] = None;
    board[0][6] = None;
    let mut game = make_match(board, PlayerColor::White);
    // Manually revoke kingside castling rights.
    game.castling_rights.white_kingside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

// ===========================================================================
// 8. Check / Checkmate / Stalemate (4 tests)
// ===========================================================================

#[test]
fn is_king_in_check_detection() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // Black rook on the same rank, clear path.
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_king_in_check(&board, PlayerColor::White));
}

#[test]
fn checkmate_detection() {
    // Position: black king at (0,0), white queen at (1,1), white rook at (0,2),
    // white king at (7,7).  White moves queen (1,1) -> (0,1) delivering checkmate.
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[0][2] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 1, 0, 1, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Checkmate);
}

#[test]
fn stalemate_detection() {
    // Position: black king at (0,0), white queen at (2,2), white king at (7,7).
    // White moves queen (2,2) -> (1,2).  Black king has no legal moves but is
    // NOT in check — stalemate.
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[2][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 1, 2, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Stalemate);
}

#[test]
fn not_checkmate_when_escape_exists() {
    // Black king at (0,0), white rook at (1,7), kings at safe distance.
    // White moves rook (1,7) -> (0,7), putting black king in check.
    // Black king can escape to (1,0) — not checkmate.
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 7, 0, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Normal);
}

// ===========================================================================
// 9. Endgame Rules (2 tests)
// ===========================================================================

#[test]
fn fifty_move_rule_draw() {
    let mut board = board_with_kings();
    // Place a knight so we can make a non-pawn, non-capture move.
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    // Set the halfmove clock to 99; after the knight move it becomes 100 and
    // the >= 100 check triggers a stalemate (treated as draw).
    game.halfmove_clock = 99;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    // After incrementing, halfmove_clock >= 100, so the result should be Stalemate.
    assert_eq!(result.unwrap(), MoveResult::Stalemate);
}

#[test]
fn insufficient_material_k_vs_k() {
    let board = board_with_kings();
    assert!(chess_logic::is_insufficient_material(&board));
}

// ===========================================================================
// 10. validate_and_apply_move Integration (14 tests)
// ===========================================================================

#[test]
fn integration_out_of_bounds_move_rejected() {
    let mut game = standard_match(PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 8, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn integration_empty_source_rejected() {
    let board = board_with_kings();
    // (4, 0) is empty.
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 4, 0, 5, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn integration_own_piece_onto_own_piece_rejected() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn integration_wrong_turn_rejected() {
    let mut game = standard_match(PlayerColor::White);
    // White's turn, but the caller passes Black as the player color.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::Black, None,
    );
    assert!(result.is_err());
}

#[test]
fn integration_move_leaves_king_in_check_absolute_pin() {
    // White king at (0,4), black rook at (0,0), white knight at (0,1).
    // The knight is absolutely pinned. Moving it exposes the king to check.
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn integration_en_passant_clears_correct_square() {
    let mut board = board_with_kings();
    board[4][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[4][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.en_passant_target = Some(EnPassantSquare { row: 5, col: 1 });

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 4, 0, 5, 1, PlayerColor::White, None,
    );
    // The black pawn that was on row 4, col 1 must be removed.
    assert!(game.board[4][1].is_none());
}

#[test]
fn integration_promotion_sets_correct_piece_type() {
    let mut board = board_with_kings();
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 7, 0, PlayerColor::White, Some(PieceType::Knight),
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[7][0],
        Some(Piece {
            piece_type: PieceType::Knight,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn integration_checkmate_result_returned() {
    // Same setup as the standalone checkmate test.
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[0][2] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 1, 0, 1, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Checkmate);
}

#[test]
fn integration_stalemate_result_returned() {
    // Same setup as the standalone stalemate test.
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[2][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 1, 2, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Stalemate);
}

#[test]
fn integration_castling_rook_moves_correctly() {
    let mut board = chess_logic::initialize_chess_board();
    board[0][5] = None;
    board[0][6] = None;
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    // Rook moved from h1 (col 7) to f1 (col 5).
    assert_eq!(
        game.board[0][5],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        })
    );
    assert!(game.board[0][7].is_none());
    // King landed on g1 (col 6).
    assert_eq!(
        game.board[0][6],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        })
    );
}

#[test]
fn integration_threefold_repetition_returns_draw() {
    // Use a minimal board with two kings (far apart) and two knights.
    // We make a knight dance: N out, N back, N out, N back, N out (third time).
    // After the 9th move the position-repetition check triggers ThreefoldRepetition.
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[7][6] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    // Move 1 (W): N(0,1)->(2,2)
    let r1 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r1.is_ok() && r1.unwrap() == MoveResult::Normal);

    // Move 2 (B): N(7,6)->(5,5)
    let r2 = chess_logic::validate_and_apply_move(
        &mut game, 7, 6, 5, 5, PlayerColor::Black, None,
    );
    assert!(r2.is_ok() && r2.unwrap() == MoveResult::Normal);

    // Move 3 (W): N(2,2)->(0,1)
    let r3 = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 0, 1, PlayerColor::White, None,
    );
    assert!(r3.is_ok() && r3.unwrap() == MoveResult::Normal);

    // Move 4 (B): N(5,5)->(7,6)
    let r4 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r4.is_ok() && r4.unwrap() == MoveResult::Normal);

    // Move 5 (W): N(0,1)->(2,2) — revisit position after move 1
    let r5 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r5.is_ok() && r5.unwrap() == MoveResult::Normal);

    // Move 6 (B): N(7,6)->(5,5) — revisit position after move 2
    let r6 = chess_logic::validate_and_apply_move(
        &mut game, 7, 6, 5, 5, PlayerColor::Black, None,
    );
    assert!(r6.is_ok() && r6.unwrap() == MoveResult::Normal);

    // Move 7 (W): N(2,2)->(0,1) — revisit position after move 3
    let r7 = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 0, 1, PlayerColor::White, None,
    );
    assert!(r7.is_ok() && r7.unwrap() == MoveResult::Normal);

    // Move 8 (B): N(5,5)->(7,6) — revisit position after move 4
    let r8 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r8.is_ok() && r8.unwrap() == MoveResult::Normal);

    // Move 9 (W): N(0,1)->(2,2) — third visit to the position after move 1.
    // This should trigger ThreefoldRepetition.
    let r9 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r9.is_ok());
    assert_eq!(r9.unwrap(), MoveResult::ThreefoldRepetition);
}

#[test]
fn integration_halfmove_clock_resets_on_pawn_move() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.halfmove_clock = 42;

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert_eq!(game.halfmove_clock, 0);
}

#[test]
fn integration_halfmove_clock_resets_on_capture() {
    let mut board = board_with_kings();
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.halfmove_clock = 15;

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 0, PlayerColor::White, None,
    );
    assert_eq!(game.halfmove_clock, 0);
}

#[test]
fn integration_position_history_pushed_after_move() {
    let mut game = standard_match(PlayerColor::White);
    assert!(game.position_history.is_empty());

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    // After the first move exactly one position hash is recorded.
    assert_eq!(game.position_history.len(), 1);
}

// ===========================================================================
// 11. Board Initialization (2 tests)
// ===========================================================================

#[test]
fn board_init_has_32_pieces() {
    let board = chess_logic::initialize_chess_board();
    let mut count = 0;
    for row in 0..8 {
        for col in 0..8 {
            if board[row][col].is_some() {
                count += 1;
            }
        }
    }
    assert_eq!(count, 32);
}

#[test]
fn board_init_has_exactly_2_kings() {
    let board = chess_logic::initialize_chess_board();
    let mut white_kings = 0;
    let mut black_kings = 0;
    for row in 0..8 {
        for col in 0..8 {
            if let Some(p) = &board[row][col] {
                if p.piece_type == PieceType::King {
                    match p.color {
                        PlayerColor::White => white_kings += 1,
                        PlayerColor::Black => black_kings += 1,
                    }
                }
            }
        }
    }
    assert_eq!(white_kings, 1);
    assert_eq!(black_kings, 1);
}

// ===========================================================================
// 12. Rare Edge Cases — PAWN (tests from unit_chess_piece_gaps.rs)
// ===========================================================================

#[test]
fn pawn_blocked_by_opponent_directly_in_front() {
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    board = place(board, 2, 0, PieceType::Pawn, PlayerColor::Black);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Pawn should not advance onto a square occupied by an opponent piece"
    );
}

#[test]
fn pawn_double_advance_not_from_start_rank() {
    let mut board = board_with_kings();
    board = place(board, 2, 0, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 2, 0, 4, 0, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Pawn not on start rank should not be able to double-advance"
    );
}

#[test]
fn pawn_cannot_capture_forward() {
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    // (2,1) is intentionally empty.
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 1, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Pawn cannot move diagonally unless capturing an enemy piece"
    );
}

#[test]
fn pawn_promotion_to_king_rejected() {
    let mut board = board_with_kings();
    board = place(board, 6, 0, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 7, 0, PlayerColor::White, Some(PieceType::King),
    );
    assert!(
        result.is_err(),
        "Pawn promotion to King must be rejected as InvalidPromotionPiece"
    );
}

#[test]
fn pawn_auto_promotion_to_queen() {
    let mut board = board_with_kings();
    board = place(board, 6, 0, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 7, 0, PlayerColor::White, None,
    );
    assert!(
        result.is_ok(),
        "Pawn reaching last rank with no promotion specified should auto-promote to Queen"
    );
    assert_eq!(
        game.board[7][0],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        }),
        "Auto-promoted piece should be a White Queen"
    );
    assert!(game.board[6][0].is_none(), "Source square should be empty after promotion");
}

#[test]
fn pawn_promotion_not_on_last_rank_rejected() {
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, Some(PieceType::Queen),
    );
    assert!(
        result.is_err(),
        "Promotion specified on a square that is not the last rank must be rejected"
    );
}

#[test]
fn pawn_double_advance_sets_en_passant() {
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 3, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok(), "Double-advance should be legal");
    assert_eq!(
        game.en_passant_target,
        Some(EnPassantSquare { row: 2, col: 0 }),
        "En-passant target must be the square the pawn passed through (row 2, col 0)"
    );
}

#[test]
fn pawn_en_passant_only_immediately_available() {
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    board = place(board, 7, 0, PieceType::Rook, PlayerColor::Black);
    let mut game = make_match(board, PlayerColor::White);

    // 1. White double-advances pawn (1,0) -> (3,0). EP set to (2,0).
    let r1 = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 3, 0, PlayerColor::White, None,
    );
    assert!(r1.is_ok(), "White pawn double-advance should be legal");
    assert_eq!(
        game.en_passant_target,
        Some(EnPassantSquare { row: 2, col: 0 }),
        "EP target should be set after White's double-advance"
    );

    // 2. Black moves rook (7,0) -> (6,0). EP must be cleared.
    let r2 = chess_logic::validate_and_apply_move(
        &mut game, 7, 0, 6, 0, PlayerColor::Black, None,
    );
    assert!(r2.is_ok(), "Black rook slide should be legal");
    assert_eq!(
        game.en_passant_target, None,
        "EP target must be cleared after the opponent makes any move other than a pawn double-advance"
    );
}

// ===========================================================================
// 13. Rare Edge Cases — KNIGHT
// ===========================================================================

#[test]
fn knight_all_8_l_shape_variants_from_center() {
    let knight_destinations: [(u8, u8); 8] = [
        (2, 3),
        (2, 5),
        (3, 2),
        (3, 6),
        (5, 2),
        (5, 6),
        (6, 3),
        (6, 5),
    ];

    for &(dr, dc) in knight_destinations.iter() {
        let mut board = board_with_kings();
        board = place(board, 4, 4, PieceType::Knight, PlayerColor::White);
        let mut game = make_match(board, PlayerColor::White);

        let result = chess_logic::validate_and_apply_move(
            &mut game, 4, 4, dr, dc, PlayerColor::White, None,
        );
        assert!(
            result.is_ok(),
            "Knight at (4,4) should be able to reach ({},{})", dr, dc
        );
    }

    // A non-L-shape move like (4,4) -> (4,6) must be rejected.
    {
        let mut board = board_with_kings();
        board = place(board, 4, 4, PieceType::Knight, PlayerColor::White);
        let mut game = make_match(board, PlayerColor::White);
        let result = chess_logic::validate_and_apply_move(
            &mut game, 4, 4, 4, 6, PlayerColor::White, None,
        );
        assert!(
            result.is_err(),
            "Knight at (4,4) -> (4,6) is not an L-shape and must be rejected"
        );
    }
}

#[test]
fn knight_jumps_over_surrounding_pieces() {
    let mut board = board_with_kings();
    board = place(board, 0, 1, PieceType::Knight, PlayerColor::White);
    // Occupy all adjacent / near squares with various pieces.
    board = place(board, 0, 0, PieceType::Pawn, PlayerColor::White);
    board = place(board, 0, 2, PieceType::Pawn, PlayerColor::White);
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    board = place(board, 1, 1, PieceType::Pawn, PlayerColor::White);
    board = place(board, 1, 2, PieceType::Pawn, PlayerColor::White);
    // Place an enemy piece on the target square — a capture.
    board = place(board, 2, 0, PieceType::Pawn, PlayerColor::Black);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 0, PlayerColor::White, None,
    );
    assert!(
        result.is_ok(),
        "Knight should reach (2,0) even when all surrounding squares are occupied"
    );
    assert_eq!(
        game.board[2][0],
        Some(Piece {
            piece_type: PieceType::Knight,
            color: PlayerColor::White,
        }),
        "Knight should land on (2,0) after capturing the black pawn"
    );
    assert!(game.board[0][1].is_none(), "Source square should be empty");
}

// ===========================================================================
// 14. Rare Edge Cases — BISHOP
// ===========================================================================

#[test]
fn bishop_non_diagonal_rejected() {
    let mut board = board_with_kings();
    board = place(board, 3, 3, PieceType::Bishop, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 3, 5, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Bishop cannot move horizontally (non-diagonal)"
    );
}

#[test]
fn bishop_one_square_diagonal() {
    let mut board = board_with_kings();
    board = place(board, 3, 3, PieceType::Bishop, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 4, 4, PlayerColor::White, None,
    );
    assert!(
        result.is_ok(),
        "Bishop should be able to move one square diagonally"
    );
    assert_eq!(
        game.board[4][4],
        Some(Piece {
            piece_type: PieceType::Bishop,
            color: PlayerColor::White,
        }),
        "Bishop should occupy (4,4) after the move"
    );
}

// ===========================================================================
// 15. Rare Edge Cases — ROOK
// ===========================================================================

#[test]
fn rook_non_linear_rejected() {
    let mut board = board_with_kings();
    board = place(board, 3, 0, PieceType::Rook, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 5, 2, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Rook cannot move diagonally (non-linear)"
    );
}

#[test]
fn rook_one_square_move() {
    let mut board = board_with_kings();
    board = place(board, 3, 0, PieceType::Rook, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 0, 3, 1, PlayerColor::White, None,
    );
    assert!(
        result.is_ok(),
        "Rook should be able to move a single square horizontally"
    );
    assert_eq!(
        game.board[3][1],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        }),
        "Rook should occupy (3,1) after the move"
    );
    assert!(game.board[3][0].is_none(), "Source square should be empty");
}

// ===========================================================================
// 16. Rare Edge Cases — QUEEN
// ===========================================================================

#[test]
fn queen_blocked_by_friendly_piece() {
    let mut board = board_with_kings();
    board = place(board, 3, 3, PieceType::Queen, PlayerColor::White);
    board = place(board, 5, 5, PieceType::Pawn, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Queen must be blocked by a friendly piece on the diagonal path"
    );
}

#[test]
fn queen_captures_opponent() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[3][3] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 7, 7, PlayerColor::White, None,
    );
    assert!(result.is_ok(), "Queen should capture the enemy pawn at (7,7)");
    assert_eq!(
        game.board[7][7],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        }),
        "Queen should occupy (7,7) after capture"
    );
    assert!(game.board[3][3].is_none(), "Source square should be empty");
}

#[test]
fn queen_non_linear_non_diagonal_rejected() {
    let mut board = board_with_kings();
    board = place(board, 3, 3, PieceType::Queen, PlayerColor::White);
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 3, 3, 5, 4, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "Queen cannot move in a knight-like L-shape"
    );
}

// ===========================================================================
// 17. Rare Edge Cases — KING
// ===========================================================================

#[test]
fn king_cannot_move_adjacent_to_enemy_king() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][6] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 5, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "King cannot move to a square adjacent to the enemy king (would be in check)"
    );
}

#[test]
fn king_cannot_capture_defended_piece() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[1][4] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    board[1][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[7][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 1, 4, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "King cannot capture a piece defended by an enemy rook (would be in check after capture)"
    );
}

#[test]
fn king_move_updates_own_castling_rights_only() {
    let board = board_with_kings();
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 1, 4, PlayerColor::White, None,
    );
    assert!(result.is_ok(), "King one-square move should be legal");

    assert!(
        !game.castling_rights.white_kingside,
        "White kingside castling must be lost after kings move"
    );
    assert!(
        !game.castling_rights.white_queenside,
        "White queenside castling must be lost after kings move"
    );
    assert!(
        game.castling_rights.black_kingside,
        "Black kingside castling must NOT be affected by White king move"
    );
    assert!(
        game.castling_rights.black_queenside,
        "Black queenside castling must NOT be affected by White king move"
    );
}

// ===========================================================================
// 18. Castling + Endgame (from unit_chess_castling_endgame.rs)
// ===========================================================================

/// Castling through check — queenside.
/// White king at e1 (0,4), rook at a1 (0,0). b1, c1, d1 are clear.
/// Black bishop on a3 (2,0) attacks c1 (0,2). Castling rejected.
#[test]
fn castling_through_check_queenside() {
    let mut board = board_with_kings();
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = false;
    game.castling_rights.white_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 2, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// After a rook moves out and returns to its starting square,
/// castling rights are lost and castling is rejected.
#[test]
fn castling_rook_moved_loses_rights() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    // Move 1 (White): rook h1 -> g1  (0,7 -> 0,6).  This revokes white_kingside.
    let r1 = chess_logic::validate_and_apply_move(
        &mut game, 0, 7, 0, 6, PlayerColor::White, None,
    );
    assert!(r1.is_ok());
    assert!(!game.castling_rights.white_kingside);

    // Move 2 (Black): king advances one square to pass the turn back.
    let r2 = chess_logic::validate_and_apply_move(
        &mut game, 7, 4, 6, 4, PlayerColor::Black, None,
    );
    assert!(r2.is_ok());

    // Move 3 (White): rook returns g1 -> h1 (0,6 -> 0,7).
    let r3 = chess_logic::validate_and_apply_move(
        &mut game, 0, 6, 0, 7, PlayerColor::White, None,
    );
    assert!(r3.is_ok());
    assert!(!game.castling_rights.white_kingside);

    // Move 4 (Black): king moves back.
    let r4 = chess_logic::validate_and_apply_move(
        &mut game, 6, 4, 7, 4, PlayerColor::Black, None,
    );
    assert!(r4.is_ok());

    // Now white tries to castle kingside — rejected.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Kingside castling rejected when the rook is missing from h1.
#[test]
fn castling_rook_missing_from_square() {
    let board = board_with_kings();

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Queenside castling rejected when the rook is missing from a1.
#[test]
fn castling_rook_missing_queenside() {
    let board = board_with_kings();

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = false;
    game.castling_rights.white_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 2, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Kingside castling rejected because f1 is occupied by a piece.
#[test]
fn castling_blocked_by_piece_between() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[0][5] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Kingside castling rejected when the piece on h1 is a black rook (wrong color).
#[test]
fn castling_rook_wrong_color() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Kingside castling rejected when a white knight sits on h1 (rook captured/replaced).
#[test]
fn castling_after_rook_captured_on_starting_square() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

// ===========================================================================
// 19. Check / Checkmate / Stalemate Edge Cases
// ===========================================================================

/// Discovered check: white knight blocks black rook's attack on the white king.
#[test]
fn discovered_check_detection() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][5] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 5, 2, 6, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Double check: white king attacked simultaneously by a black rook and a black bishop.
#[test]
fn double_check() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[2][2] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    assert!(chess_logic::is_king_in_check(&board, PlayerColor::White));
}

/// "Smothered mate" style check: black king at a8 blocked in by own pieces.
#[test]
fn checkmate_smothered_check_position() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[2][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });

    assert!(chess_logic::is_king_in_check(&board, PlayerColor::Black));
}

/// Stalemate: black king at a8 has no legal moves but is NOT in check.
#[test]
fn stalemate_no_legal_moves_no_check() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });

    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 7, 7, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Stalemate);
}

/// Not stalemate: king has no moves but a friendly pawn can still move.
#[test]
fn not_stalemate_when_pawn_can_move() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[5][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 7, 7, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Normal);
}

// ===========================================================================
// 20. Endgame Rules — Insufficient Material
// ===========================================================================

#[test]
fn insufficient_material_k_b_vs_k() {
    let mut board = board_with_kings();
    board[0][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn insufficient_material_k_n_vs_k() {
    let mut board = board_with_kings();
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn insufficient_material_k_b_vs_k_b_same_color() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[1][7] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn insufficient_material_k_b_vs_k_b_different_color() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[3][4] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

#[test]
fn sufficient_material_with_rook() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

// ===========================================================================
// 21. Endgame Rules — Fifty-Move & Threefold Edge Cases
// ===========================================================================

#[test]
fn fifty_move_rule_not_triggered_at_49() {
    let mut board = board_with_kings();
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.halfmove_clock = 49;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 7, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(game.halfmove_clock, 50);
    assert_eq!(result.unwrap(), MoveResult::Normal);
}

#[test]
fn threefold_repetition_not_triggered_at_two() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[7][6] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    // Move 1 (W): N(0,1)->(2,2)
    let r1 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r1.is_ok() && r1.unwrap() == MoveResult::Normal);

    // Move 2 (B): N(7,6)->(5,5)
    let r2 = chess_logic::validate_and_apply_move(
        &mut game, 7, 6, 5, 5, PlayerColor::Black, None,
    );
    assert!(r2.is_ok() && r2.unwrap() == MoveResult::Normal);

    // Move 3 (W): N(2,2)->(0,1)
    let r3 = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 0, 1, PlayerColor::White, None,
    );
    assert!(r3.is_ok() && r3.unwrap() == MoveResult::Normal);

    // Move 4 (B): N(5,5)->(7,6) — position returns to initial.
    let r4 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r4.is_ok() && r4.unwrap() == MoveResult::Normal);

    // Move 5 (W): N(0,1)->(2,2)
    let r5 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r5.is_ok() && r5.unwrap() == MoveResult::Normal);

    // Move 6 (B): N(7,6)->(5,5)
    let r6 = chess_logic::validate_and_apply_move(
        &mut game, 7, 6, 5, 5, PlayerColor::Black, None,
    );
    assert!(r6.is_ok() && r6.unwrap() == MoveResult::Normal);

    // Move 7 (W): N(2,2)->(0,1)
    let r7 = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 0, 1, PlayerColor::White, None,
    );
    assert!(r7.is_ok() && r7.unwrap() == MoveResult::Normal);

    // Move 8 (B): N(5,5)->(7,6) — second occurrence (not 3).
    let r8 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r8.is_ok());
    assert_eq!(r8.unwrap(), MoveResult::Normal);
}

// ===========================================================================
// 22. Zobrist Hash Tests
// ===========================================================================

#[test]
fn zobrist_hash_different_positions_different_hashes() {
    let board1 = chess_logic::initialize_chess_board();

    let mut board2 = chess_logic::initialize_chess_board();
    board2[3][4] = board2[1][4].take(); // pawn from e2 to e4

    let castling_rights = CastlingRights::new();
    let hash1 = chess_logic::compute_zobrist_hash(
        &board1, &castling_rights, None, PlayerColor::White,
    );
    let hash2 = chess_logic::compute_zobrist_hash(
        &board2, &castling_rights, None, PlayerColor::White,
    );
    assert_ne!(hash1, hash2);
}

#[test]
fn zobrist_hash_same_position_same_hash() {
    let board = chess_logic::initialize_chess_board();
    let castling_rights = CastlingRights::new();

    let hash1 = chess_logic::compute_zobrist_hash(
        &board, &castling_rights, None, PlayerColor::White,
    );
    let hash2 = chess_logic::compute_zobrist_hash(
        &board, &castling_rights, None, PlayerColor::White,
    );
    assert_eq!(hash1, hash2);
}

// ===========================================================================
// 23. Integration Corners (from unit_chess_integration_corners.rs)
// ===========================================================================

// Section A — Rare edge-case move rejections

#[test]
fn self_capture_rejected() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn source_equals_destination_rejected() {
    let mut board = board_with_kings();
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 0, 0, 0, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

// Section B — Fullmove counter behaviour

#[test]
fn fullmove_counter_stays_after_white_move() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.fullmove_number = 1;

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert_eq!(game.fullmove_number, 1, "fullmove should stay 1 after white's move");
}

#[test]
fn fullmove_counter_increments_after_black_move() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.fullmove_number = 1;

    // White move first
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert_eq!(game.current_turn, PlayerColor::Black);
    assert_eq!(game.fullmove_number, 1);

    // Then Black move — should bump fullmove from 1 to 2.
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 5, 0, PlayerColor::Black, None,
    );
    assert_eq!(game.fullmove_number, 2);
}

#[test]
fn fullmove_counter_stays_after_second_white_move() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    // W move 1
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    // B move 1 — fullmove becomes 2
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 6, 0, 5, 0, PlayerColor::Black, None,
    );
    assert_eq!(game.fullmove_number, 2);

    // W move 2 — fullmove should stay at 2
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 1, 2, 1, PlayerColor::White, None,
    );
    assert_eq!(
        game.fullmove_number, 2,
        "fullmove should stay 2 after white's second move"
    );
}

// Section C — En passant lifecycle

#[test]
fn en_passant_cleared_after_any_move() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[7][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    // White double-advances — en-passant target set to (2, 0)
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 3, 0, PlayerColor::White, None,
    );
    assert!(game.en_passant_target.is_some());

    // Black makes an unrelated knight move — EP must be cleared.
    let _ = chess_logic::validate_and_apply_move(
        &mut game, 7, 1, 5, 2, PlayerColor::Black, None,
    );
    assert!(
        game.en_passant_target.is_none(),
        "en passant target should be cleared after any non-double-pawn move"
    );
}

#[test]
fn en_passant_capture_correct_pawn_removed_white() {
    let mut board = board_with_kings();
    board[4][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[4][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[6][2] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.en_passant_target = Some(EnPassantSquare { row: 5, col: 1 });

    let _ = chess_logic::validate_and_apply_move(
        &mut game, 4, 0, 5, 1, PlayerColor::White, None,
    );

    // Landing square holds the white pawn.
    assert_eq!(
        game.board[5][1],
        Some(Piece {
            piece_type: PieceType::Pawn,
            color: PlayerColor::White,
        })
    );
    // The black pawn on the en-passant-captured square (4,1) must be gone.
    assert!(
        game.board[4][1].is_none(),
        "the black pawn on the EP-captured square should be removed"
    );
    // The unrelated black knight must still be present.
    assert!(
        game.board[6][2].is_some(),
        "unrelated pieces should not be affected by en-passant capture"
    );
}

// Section D — Castling-rights mutation

#[test]
fn castling_rights_update_after_queenside_rook_move() {
    let mut board = board_with_kings();
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = true;

    // Queenside rook moves from a1 (0,0) to a3 (2,0).
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());

    assert!(
        !game.castling_rights.white_queenside,
        "white queenside castling should be revoked after a1 rook moves"
    );
    assert!(
        game.castling_rights.white_kingside,
        "white kingside castling should remain true — h1 rook hasn't moved"
    );
}

#[test]
fn castling_king_side_rook_ends_on_correct_square() {
    let mut board = chess_logic::initialize_chess_board();
    board[0][5] = None; // bishop
    board[0][6] = None; // knight
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());

    assert_eq!(
        game.board[0][6],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        }),
        "king should be on g1 (0,6)"
    );
    assert_eq!(
        game.board[0][5],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        }),
        "rook should be on f1 (0,5)"
    );
    assert!(game.board[0][4].is_none(), "king's original square should be empty");
    assert!(game.board[0][7].is_none(), "rook's original square should be empty");
}

#[test]
fn castling_queenside_rook_ends_on_correct_square() {
    let mut board = chess_logic::initialize_chess_board();
    board[0][3] = None; // queen
    board[0][2] = None; // bishop
    board[0][1] = None; // knight
    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 2, PlayerColor::White, None,
    );
    assert!(result.is_ok());

    assert_eq!(
        game.board[0][2],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        }),
        "king should be on c1 (0,2)"
    );
    assert_eq!(
        game.board[0][3],
        Some(Piece {
            piece_type: PieceType::Rook,
            color: PlayerColor::White,
        }),
        "rook should be on d1 (0,3)"
    );
    assert!(game.board[0][4].is_none(), "king's original square should be empty");
    assert!(game.board[0][0].is_none(), "rook's original square should be empty");
}

// Section E — Checkmate detection via delivering move

#[test]
fn king_in_check_no_legal_moves_is_checkmate() {
    let mut board = [[None; 8]; 8];
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[6][5] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::Black,
    });
    board[7][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::Black);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 6, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Checkmate);
}

// Section F — Position-history ring-buffer behaviour

#[test]
fn push_position_hash_no_panic_empty_history() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    assert!(game.position_history.is_empty());

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(game.position_history.len(), 1);
}

#[test]
fn position_history_evicts_oldest_when_full() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);

    // Manually fill the position history to its CAP (200).
    for i in 0..200u64 {
        game.position_history.push(i);
    }
    assert_eq!(game.position_history.len(), 200);
    let oldest_hash_before = game.position_history[0];

    // Make a move — push_position_hash will evict index 0 then push.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.position_history.len(),
        200,
        "position history must stay at 200 entries"
    );
    assert_ne!(
        game.position_history[0], oldest_hash_before,
        "the oldest hash before the move should have been evicted"
    );
}

// Section G — Absolutely pinned pieces

#[test]
fn absolutely_pinned_piece_cannot_move_off_pin_line() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[0][5] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 5, 2, 7, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

#[test]
fn pinned_piece_can_move_along_pin_line() {
    let mut board = [[None; 8]; 8];
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[0][5] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 5, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(
        game.board[0][6],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        }),
    );
    assert!(game.board[0][5].is_none());
}

// Section H — En-passant discovered check

#[test]
fn en_passant_discovered_check_rejected() {
    let mut board = [[None; 8]; 8];
    board[4][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    board[4][2] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[4][3] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[4][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);
    game.en_passant_target = Some(EnPassantSquare { row: 5, col: 3 });

    let result = chess_logic::validate_and_apply_move(
        &mut game, 4, 2, 5, 3, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "EP capture exposing king to rook must be rejected"
    );
}

// Section I — State-machine / game-status tests

#[test]
fn game_status_active_allows_moves() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.game_status = GameStatus::Active;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
}

// Section J — Board-boundary scenarios

#[test]
fn maximum_board_positions_32_pieces_move_works() {
    let board = chess_logic::initialize_chess_board();

    let mut count = 0;
    for row in 0..8 {
        for col in 0..8 {
            if board[row][col].is_some() {
                count += 1;
            }
        }
    }
    assert_eq!(count, 32);

    let mut game = make_match(board, PlayerColor::White);
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
}

#[test]
fn empty_board_just_kings_king_move_works() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 0, 1, 0, PlayerColor::White, None,
    );
    assert!(
        result.is_ok(),
        "king should be able to move on a nearly empty board"
    );
    assert_eq!(
        game.board[1][0],
        Some(Piece {
            piece_type: PieceType::King,
            color: PlayerColor::White,
        }),
    );
}

// Section K — Promotion with capture

#[test]
fn promotion_with_capture() {
    let mut board = board_with_kings();
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    board[7][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game,
        6, 0,
        7, 1,
        PlayerColor::White,
        Some(PieceType::Queen),
    );
    assert!(result.is_ok());

    assert_eq!(
        game.board[7][1],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        }),
        "pawn should promote to queen on the capture square"
    );
    assert!(game.board[7][1].is_some(), "but it's the queen now");
    assert!(game.board[6][0].is_none());
}

// Section L — Insufficient-material after simplification

#[test]
fn insufficient_material_kb_vs_k() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn insufficient_material_kn_vs_k() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn insufficient_material_kb_vs_kb_same_colour() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[4][2] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

#[test]
fn sufficient_material_kb_vs_kb_opposite_colour() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    board[4][1] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

#[test]
fn sufficient_material_kq_vs_k() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}
