// Tests for piece-movement edge cases in Magic Chess.
// Fills gaps in unit_chess.rs by covering paths not exercised by the main suite.
//
// Every test constructs its own custom board. No test depends on the standard
// starting position for setup — only on the helpers copied below.

use anchor_lang::prelude::Pubkey;
use magic_chess::state::*;
use magic_chess::utils::chess_logic;

// ---------------------------------------------------------------------------
// Test helpers (mirror of unit_chess.rs — integration tests cannot share code)
// ---------------------------------------------------------------------------

fn make_match(board: [[Option<Piece>; 8]; 8], current_turn: PlayerColor) -> ChessMatch {
    ChessMatch {
        match_id: "test_gaps".to_string(),
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

/// Board with only two kings placed on their home squares (far apart).
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

/// Place a piece on a board.
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
// PAWN edge cases (tests 1-8)
// ===========================================================================

#[test]
fn pawn_blocked_by_opponent_directly_in_front() {
    // White pawn at (1,0), black pawn at (2,0). Single advance to (2,0) is
    // blocked because pawns cannot capture forward — and the target is occupied.
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
    // White pawn at (2,0) — already moved off rank 1. Double advance to (4,0)
    // must be rejected because only pawns on their home rank can double-advance.
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
    // White pawn at (1,0). No enemy on (2,1). Diagonal move to (2,1) must be
    // rejected — pawns only move diagonally to capture.
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
    // White pawn at (6,0), one step from promotion. Choosing King as the
    // promotion piece is illegal — only Queen, Rook, Bishop, Knight are allowed.
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
    // White pawn at (6,0). No promotion piece supplied — the engine must
    // default to Queen.
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
    // White pawn at (1,0) tries to single-advance to (2,0) while passing
    // Some(Queen) as promotion. Promotion is only valid when the pawn lands on
    // the last rank.
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
    // White pawn at (1,0) double-advances to (3,0). The en-passant target must
    // be set to the square the pawn passed through: row 2, col 0.
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
    // White pawn double-advances, setting en-passant target (row 2, col 0).
    // Then Black makes an unrelated move (rook slides one square). After
    // Black's move the en-passant target must be cleared.
    let mut board = board_with_kings();
    board = place(board, 1, 0, PieceType::Pawn, PlayerColor::White);
    // Give Black a rook that can make a harmless non-pawn move.
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
// KNIGHT edge cases (tests 9-10)
// ===========================================================================

#[test]
fn knight_all_8_l_shape_variants_from_center() {
    // Knight at (4,4). All 8 L-shaped destinations must be accepted;
    // a non-L-shape destination must be rejected.
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
    // Knight at (0,1). Surrounding squares are occupied (which would block a
    // rook, bishop, or queen). The knight must still reach its L-shaped
    // destination without obstruction, including capturing an enemy on arrival.
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
// BISHOP edge cases (tests 11-12)
// ===========================================================================

#[test]
fn bishop_non_diagonal_rejected() {
    // Bishop at (3,3) tries moving horizontally to (3,5). Not a diagonal —
    // must be rejected.
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
    // Bishop at (3,3) moves one square diagonally to (4,4). Must be valid.
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
// ROOK edge cases (tests 13-14)
// ===========================================================================

#[test]
fn rook_non_linear_rejected() {
    // Rook at (3,0) tries moving diagonally to (5,2). Rooks only move along
    // ranks / files — must be rejected.
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
    // Rook at (3,0) slides one square horizontally to (3,1). Must be valid.
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
// QUEEN edge cases (tests 15-17)
// ===========================================================================

#[test]
fn queen_blocked_by_friendly_piece() {
    // Queen at (3,3) tries moving to (7,7) but a friendly pawn sits at (5,5)
    // on the diagonal. Must be rejected.
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
    // Queen at (3,3) captures an enemy pawn at (7,7). Diagonal is clear.
    // Black king is placed at (7,0) so the capture does not deliver check
    // (which could change the MoveResult variant unpredictably).
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
    // Queen at (3,3) tries a knight-like movement to (5,4). Queens cannot
    // move like knights — must be rejected.
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
// KING edge cases (tests 18-20)
// ===========================================================================

#[test]
fn king_cannot_move_adjacent_to_enemy_king() {
    // White king at (0,4), black king at (0,6). White tries moving to (0,5),
    // which is adjacent to the black king. After the move the white king would
    // be in check from the enemy king — must be rejected.
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
    // White king at (0,4). Black knight at (1,4) is defended by a black rook
    // at (1,7) along the same rank. King tries capturing the knight — after
    // the capture the king would be attacked by the rook. Must be rejected.
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
    // Black king far away so it doesn't interfere.
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
    // White king at (0,4) moves to (1,4). After the move both white castling
    // rights must be cleared, but black castling rights must remain untouched.
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
