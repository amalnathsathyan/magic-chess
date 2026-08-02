// Integration tests for Magic Chess — rigorous rare edge cases.
// These are pure Rust tests — no Solana VM needed.
//
// Tests the following public API from the magic_chess crate:
//   - chess_logic::initialize_chess_board()
//   - chess_logic::validate_and_apply_move()
//   - chess_logic::is_king_in_check()
//   - chess_logic::is_insufficient_material()

use anchor_lang::prelude::Pubkey;
use magic_chess::state::*;
use magic_chess::utils::chess_logic;

// ---------------------------------------------------------------------------
// Test helpers (copied from unit_chess.rs for self-contained integration crate)
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

/// Convenience: create a board with only two kings far apart.
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

// ===========================================================================
// SECTION A — Rare edge-case move rejections
// ===========================================================================

/// White pawn at (1,0) attempting to advance onto own knight at (2,0).
/// Rejected with InvalidMoveCannotCaptureOwnPiece.
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

/// Source equals destination is caught early — IllegalPieceMovement.
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

// ===========================================================================
// SECTION B — Fullmove counter behaviour
// ===========================================================================

/// fullmove_number does NOT increment after White moves.
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

/// fullmove_number increments to 2 after Black's first move of the game.
#[test]
fn fullmove_counter_increments_after_black_move() {
    let mut board = board_with_kings();
    // Give White a pawn so it can make a move first.
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

/// After a full move cycle (W then B), another White move should NOT bump fullmove again.
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
    // Give White a second pawn so it can move again.
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

// ===========================================================================
// SECTION C — En passant lifecycle
// ===========================================================================

/// After White double-advances a pawn, the en-passant target is set.
/// When Black responds with a non-pawn move, the target must be cleared (None).
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

/// White captures en passant to (5,1). Verify that specifically the black pawn
/// on (4,1) — the one that double-advanced — is removed, not some other piece.
#[test]
fn en_passant_capture_correct_pawn_removed_white() {
    let mut board = board_with_kings();
    board[4][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Black pawn that just double-advanced lands at (4,1).
    board[4][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    // Put an unrelated black piece on the board to prove it is NOT removed.
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

// ===========================================================================
// SECTION D — Castling-rights mutation
// ===========================================================================

/// Moving White's queenside rook (a1 = (0,0)) revokes white_queenside castling
/// but leaves white_kingside intact.
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
    // Ensure both rights start true.
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

/// After White kingside castling: king lands at (0,6), rook lands at (0,5).
#[test]
fn castling_king_side_rook_ends_on_correct_square() {
    let mut board = chess_logic::initialize_chess_board();
    // Clear kingside squares between king and rook.
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

/// After White queenside castling: king lands at (0,2), rook lands at (0,3).
#[test]
fn castling_queenside_rook_ends_on_correct_square() {
    let mut board = chess_logic::initialize_chess_board();
    // Clear queenside squares.
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

// ===========================================================================
// SECTION E — Checkmate detection via delivering move
// ===========================================================================

/// Position: White king at (7,7), Black king at (0,0), Black queen at (6,5),
/// Black rook at (7,0). Black's queen moves to (7,6) — checkmate.
///
/// After the move White's king is in check from the queen, (7,6) is defended
/// by the rook on rank 7, and (6,7) and (6,6) are covered by the queen.
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

// ===========================================================================
// SECTION F — Position-history ring-buffer behaviour
// ===========================================================================

/// Pushing to an empty history should not panic and length becomes 1.
#[test]
fn push_position_hash_no_panic_empty_history() {
    let mut board = board_with_kings();
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    assert!(game.position_history.is_empty());

    // Making a move calls push_position_hash internally.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(game.position_history.len(), 1);
}

/// CAP is 200. Pre-fill the history to 200 entries, then make a move.
/// The oldest entry should be evicted and length must stay at 200.
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

// ===========================================================================
// SECTION G — Absolutely pinned pieces
// ===========================================================================

/// White king at (0,4), black rook at (0,7), white queen at (0,5).
/// The queen is pinned — moving it OFF the pin line (to (2,7)) reveals check.
/// Rejected as leaving king in check.
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
        piece_type: PieceType::Queen, // can move both rank and diagonal
        color: PlayerColor::White,
    });
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    // Queen moves diagonally off the pin line: (0,5) -> (2,7).
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 5, 2, 7, PlayerColor::White, None,
    );
    assert!(result.is_err());
}

/// Same setup, but the pinned queen moves ALONG the pin line to (0,6),
/// which still blocks the rook's attack against the king.  This is legal.
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

    // Queen slides along the rank to (0,6) — still blocking the pin.
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
    // Source is now empty.
    assert!(game.board[0][5].is_none());
}

// ===========================================================================
// SECTION H — En-passant discovered check
// ===========================================================================

/// White king is on rank 4 behind two pawns that block a black rook.
/// When White captures en passant, BOTH pawns leave rank 4 —
/// the white pawn moves and the black pawn is removed.
/// This opens the rank and exposes the king to the rook — DISCOVERED CHECK.
/// The EP capture must be rejected.
#[test]
fn en_passant_discovered_check_rejected() {
    let mut board = [[None; 8]; 8];
    // Black rook on same rank as the White king, with pawns in between.
    board[4][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    // White pawn that will attempt the EP capture.
    board[4][2] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Black pawn that just double-advanced (the target of EP capture).
    board[4][3] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    // White king behind both pawns — safe while pawns block rank 4.
    board[4][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // Black king out of the way.
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);
    // EP target is (5,3) because black pawn double-advanced (6,3)->(4,3).
    game.en_passant_target = Some(EnPassantSquare { row: 5, col: 3 });

    // White pawn (4,2) attempts EP capture to (5,3).
    // This would remove the white pawn from (4,2) and the black pawn from (4,3),
    // leaving rank 4 open from col 0 to col 7 — discovered check on white king.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 4, 2, 5, 3, PlayerColor::White, None,
    );
    assert!(
        result.is_err(),
        "EP capture exposing king to rook must be rejected"
    );
}

// ===========================================================================
// SECTION I — State-machine / game-status tests
// ===========================================================================

/// When game_status is Active, a normal move succeeds without interference.
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

// ===========================================================================
// SECTION J — Board-boundary scenarios
// ===========================================================================

/// A standard starting board (32 pieces) must initialise correctly and support
/// at least one basic pawn move.
#[test]
fn maximum_board_positions_32_pieces_move_works() {
    let board = chess_logic::initialize_chess_board();

    // Verify exactly 32 pieces.
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

/// Board with only two kings placed far apart.
/// A king move must be legal and NOT leave its own king in check from the
/// other king (kings cannot be adjacent).
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
    // The black king at (7,7) should not put the white king at (1,0) in check.
}

// ===========================================================================
// SECTION K — Promotion with capture
// ===========================================================================

/// White pawn captures a black knight on the last rank and promotes to Queen.
#[test]
fn promotion_with_capture() {
    let mut board = board_with_kings();
    // White pawn on the 7th rank (row 6), one step from promotion.
    board[6][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::White,
    });
    // Black knight on the 8th rank that the pawn will capture diagonally.
    board[7][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::Black,
    });
    let mut game = make_match(board, PlayerColor::White);

    let result = chess_logic::validate_and_apply_move(
        &mut game,
        6, 0,             // from (6,0)
        7, 1,             // to (7,1) — captures knight
        PlayerColor::White,
        Some(PieceType::Queen),
    );
    assert!(result.is_ok());

    // Pawn becomes a Queen on the destination square.
    assert_eq!(
        game.board[7][1],
        Some(Piece {
            piece_type: PieceType::Queen,
            color: PlayerColor::White,
        }),
        "pawn should promote to queen on the capture square"
    );
    // The black knight must be gone.
    assert!(game.board[7][1].is_some(), "but it's the queen now");
    // Source square must be empty.
    assert!(game.board[6][0].is_none());
}

// ===========================================================================
// SECTION L — Insufficient-material after simplification
// ===========================================================================

/// K+B vs K is a draw (insufficient material).
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

/// K+N vs K is a draw.
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

/// K+B vs K+B with bishops on same colour squares is a draw.
#[test]
fn insufficient_material_kb_vs_kb_same_colour() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // (0,0): row+col = 0 (even) -> light square
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // (4,2): row+col = 6 (even) -> light square — same colour as white bishop.
    board[4][2] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

/// K+B vs K+B with bishops on opposite-colour squares is NOT insufficient.
#[test]
fn sufficient_material_kb_vs_kb_opposite_colour() {
    let mut board = [[None; 8]; 8];
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // (0,0): row+col = 0 (even) -> light square
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // (4,1): row+col = 5 (odd) -> dark square — opposite colour from white bishop.
    board[4][1] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

/// K+Q vs K is NOT insufficient material.
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
