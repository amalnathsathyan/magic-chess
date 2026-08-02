// Integration tests for Magic Chess — Castling, Check/Checkmate/Stalemate,
// Endgame Rules, and Zobrist Hashing edge cases.
//
// Tests the following public API from the magic_chess crate:
//   - chess_logic::validate_and_apply_move()
//   - chess_logic::is_king_in_check()
//   - chess_logic::is_insufficient_material()
//   - chess_logic::compute_zobrist_hash()

use anchor_lang::prelude::Pubkey;
use magic_chess::state::*;
use magic_chess::utils::chess_logic;

// ---------------------------------------------------------------------------
// Test helpers (copied from unit_chess.rs for self-contained compilation)
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

// ===========================================================================
// CASTLING Deep Tests
// ===========================================================================

/// Castling through check — queenside.
/// White king at e1 (0,4), rook at a1 (0,0). b1, c1, d1 are clear.
/// Black bishop on a3 (2,0) attacks c1 (0,2). Castling rejected.
#[test]
fn castling_through_check_queenside() {
    let mut board = board_with_kings();
    // White king at (0,4) and black king at (7,4) already set by board_with_kings.
    // White rook at a1.
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    // Black bishop on a3 — same-color diagonal as c1, attacks it.
    board[2][0] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    // b1 (0,1), c1 (0,2), d1 (0,3) are all None — path is physically clear.

    let mut game = make_match(board, PlayerColor::White);
    // Only queenside castling right enabled.
    game.castling_rights.white_kingside = false;
    game.castling_rights.white_queenside = true;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 2, PlayerColor::White, None,
    );
    // Bishop at a3 attacks c1 — king would pass through an attacked square.
    assert!(result.is_err());
}

/// After a rook moves out and returns to its starting square,
/// castling rights are lost and castling is rejected.
#[test]
fn castling_rook_moved_loses_rights() {
    let mut board = board_with_kings();
    // White king at e1 (0,4)
    // White rook at h1 (0,7)
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    // Clear f1 (0,5) so rook has a square to go.
    // g1 (0,6) is also clear (it is None already).

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
    // Rights should still be false — they do not regenerate.
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
    // White king at (0,4). No rook at h1 (0,7) — it is None.
    // Clear f1 (0,5) and g1 (0,6).

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
    // White king at (0,4). No rook at a1 (0,0) — it is None.
    // Clear b1 (0,1), c1 (0,2), d1 (0,3).

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
    // White king at (0,4), white rook at (0,7).
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    // Place own knight on f1 (0,5). g1 (0,6) is clear.
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
    // f1 is occupied, so the path is not clear.
    assert!(result.is_err());
}

/// Kingside castling rejected when the piece on h1 is a black rook,
/// not a white rook (wrong color).
#[test]
fn castling_rook_wrong_color() {
    let mut board = board_with_kings();
    // White king at (0,4).
    // Black rook at h1 (0,7) — wrong color.
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    // Clear f1 (0,5) and g1 (0,6).

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    // Rook-presence check fails: piece at h1 is not a white rook.
    assert!(result.is_err());
}

/// Kingside castling rejected when the rook was captured and a different
/// piece sits on h1. castling_rights.white_kingside is still true (bug scenario).
/// The rook-presence check should catch this.
#[test]
fn castling_after_rook_captured_on_starting_square() {
    let mut board = board_with_kings();
    // White king at (0,4).
    // A white knight sits on h1 (0,7) — rook was captured and replaced.
    board[0][7] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    // Clear f1 (0,5) and g1 (0,6).

    let mut game = make_match(board, PlayerColor::White);
    game.castling_rights.white_kingside = true;
    game.castling_rights.white_queenside = false;

    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 4, 0, 6, PlayerColor::White, None,
    );
    // Piece at h1 is not a rook — castling should be rejected.
    assert!(result.is_err());
}

// ===========================================================================
// CHECK / CHECKMATE / STALEMATE Edge Cases
// ===========================================================================

/// Discovered check: white knight blocks black rook's attack on the white king.
/// Moving the knight away exposes the king to check, so the move is rejected.
#[test]
fn discovered_check_detection() {
    let mut board = [[None; 8]; 8];
    // White king at e1 (0,4)
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // White knight at f1 (0,5) — blocks the black rook.
    board[0][5] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    // Black rook at h1 (0,7) — attacks along the rank through f1.
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    // Black king far away.
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);

    // White tries to move the knight away from (0,5) to (2,6).
    // This would expose the king to the black rook's attack.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 5, 2, 6, PlayerColor::White, None,
    );
    // Move should be rejected because it leaves the king in check.
    assert!(result.is_err());
}

/// Double check: white king attacked simultaneously by a black rook and a black bishop.
/// is_king_in_check should detect this.
#[test]
fn double_check() {
    let mut board = [[None; 8]; 8];
    // White king at e1 (0,4)
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // Black rook at a1 (0,0) — attacks king along the rank.
    board[0][0] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    // Black bishop at c3 (2,2) — attacks king along the a1-h8-style diagonal.
    board[2][2] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    // Black king far away.
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });

    // Both rook and bishop attack e1 — double check.
    assert!(chess_logic::is_king_in_check(&board, PlayerColor::White));
}

/// "Smothered mate" style check: black king at a8 (0,0) is blocked in by its
/// own rook and pawns. White knight delivers check from (2,1).
/// This is a check position — test that is_king_in_check detects it.
#[test]
fn checkmate_smothered_check_position() {
    let mut board = [[None; 8]; 8];
    // Black king at a8 (0,0)
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // Black rook at b8 (0,1) — own piece blocks one escape.
    board[0][1] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::Black,
    });
    // Black pawns at a7 (1,0) and b7 (1,1) — block other escapes.
    board[1][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    board[1][1] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });
    // White knight at c3 (2,1) — delivers check to a8.
    board[2][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    // White king far away.
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });

    // Knight at (2,1) attacks (0,0): dr=2, dc=1 — valid knight attack.
    assert!(chess_logic::is_king_in_check(&board, PlayerColor::Black));
}

/// Stalemate: black king at a8 (0,0) has no legal moves (all escapes attacked
/// by white queen at b3 (1,2)) but is NOT in check. After white makes a waiting
/// move, the result should be Stalemate.
#[test]
fn stalemate_no_legal_moves_no_check() {
    let mut board = [[None; 8]; 8];
    // Black king at a8 (0,0)
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // White queen at b3 (1,2) — attacks all three escape squares.
    //   b8 (0,1): diagonal (1,1) from queen -> attacked
    //   a7 (1,0): same row (0,2) from queen -> attacked
    //   b7 (1,1): same row (0,1) from queen -> attacked
    board[1][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    // White king at h8 (7,7) — far away.
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });

    let mut game = make_match(board, PlayerColor::White);

    // White makes a waiting move: King h8 -> h7 (7,7 -> 7,6).
    // Black king cannot move — stalemate.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 7, 7, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), MoveResult::Stalemate);
}

/// Not stalemate: king has no moves but a friendly pawn can still move.
/// are_no_legal_moves should return false, so the game continues.
#[test]
fn not_stalemate_when_pawn_can_move() {
    let mut board = [[None; 8]; 8];
    // Black king at a8 (0,0) — trapped, same as stalemate test above.
    board[0][0] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // White queen at b3 (1,2).
    board[1][2] = Some(Piece {
        piece_type: PieceType::Queen,
        color: PlayerColor::White,
    });
    // White king at h8 (7,7).
    board[7][7] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // Black pawn at a3 (5,0) — can advance, so black has legal moves.
    board[5][0] = Some(Piece {
        piece_type: PieceType::Pawn,
        color: PlayerColor::Black,
    });

    let mut game = make_match(board, PlayerColor::White);

    // White makes a waiting move: King h8 -> h7.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 7, 7, 7, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    // King has no moves but the pawn can still move — not stalemate.
    assert_eq!(result.unwrap(), MoveResult::Normal);
}

// ===========================================================================
// ENDGAME RULES — Insufficient Material
// ===========================================================================

/// King + Bishop vs King: insufficient material (cannot force checkmate).
#[test]
fn insufficient_material_k_b_vs_k() {
    let mut board = board_with_kings();
    // White bishop at d1 (0,3)
    board[0][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    // Black king at (7,4) already set by board_with_kings.
    assert!(chess_logic::is_insufficient_material(&board));
}

/// King + Knight vs King: insufficient material.
#[test]
fn insufficient_material_k_n_vs_k() {
    let mut board = board_with_kings();
    // White knight at b1 (0,1)
    board[0][1] = Some(Piece {
        piece_type: PieceType::Knight,
        color: PlayerColor::White,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

/// King + Bishop vs King + Bishop — both bishops on light squares.
/// Insufficient material because checkmate is impossible.
#[test]
fn insufficient_material_k_b_vs_k_b_same_color() {
    let mut board = [[None; 8]; 8];
    // White king at e1 (0,4)
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // White bishop on a light square: d5 (3,3) — (3+3)%2 = 0 (light).
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    // Black king at e8 (7,4)
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // Black bishop also on a light square: f5 (4,5) — (4+5)%2 = 1 — wait that's wrong.
    // f5 = row 4, col 5. (4+5)%2 = 1. That's dark.
    // Let me put it on f3 (2,5): (2+5)%2 = 1. Hmm.
    // Actually d5 is row 3 col 3: (3+3)%2 = 0.
    // Let's find a light square: a1 (0,0)=0, a3 (2,0)=0, c1 (0,2)=0, e1 (0,4)=0, g1 (0,6)=0
    // b2 (1,1)=0, d2 (1,3)=0, f2 (1,5)=0, h2 (1,7)=0
    // Let me use h2 (1,7): (1+7)%2=0.
    board[1][7] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(chess_logic::is_insufficient_material(&board));
}

/// King + Bishop vs King + Bishop — bishops on different color squares.
/// NOT insufficient material (checkmate theoretically possible).
#[test]
fn insufficient_material_k_b_vs_k_b_different_color() {
    let mut board = [[None; 8]; 8];
    // White king at e1 (0,4)
    board[0][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::White,
    });
    // White bishop on light square: d5 (3,3) — (3+3)%2 = 0.
    board[3][3] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::White,
    });
    // Black king at e8 (7,4)
    board[7][4] = Some(Piece {
        piece_type: PieceType::King,
        color: PlayerColor::Black,
    });
    // Black bishop on dark square: e4 (3,4) — (3+4)%2 = 1.
    board[3][4] = Some(Piece {
        piece_type: PieceType::Bishop,
        color: PlayerColor::Black,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

/// King + Rook vs King: sufficient material (checkmate can be forced).
#[test]
fn sufficient_material_with_rook() {
    let mut board = board_with_kings();
    // White rook at h1 (0,7)
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    assert!(!chess_logic::is_insufficient_material(&board));
}

// ===========================================================================
// ENDGAME RULES — Fifty-Move & Threefold Edge Cases
// ===========================================================================

/// Fifty-move rule NOT triggered at 49 halfmoves.
/// After a non-pawn, non-capture move, halfmove_clock increments to 50 (< 100).
/// Result should be Normal. Uses K+R vs K (sufficient material) so the
/// insufficient-material check does not short-circuit before the fifty-move check.
#[test]
fn fifty_move_rule_not_triggered_at_49() {
    let mut board = board_with_kings();
    // Place a white rook so we can make a non-pawn, non-capture move.
    // K+R vs K is sufficient material — the insufficient-material check
    // will NOT short-circuit, allowing the fifty-move check to run.
    board[0][7] = Some(Piece {
        piece_type: PieceType::Rook,
        color: PlayerColor::White,
    });
    let mut game = make_match(board, PlayerColor::White);
    game.halfmove_clock = 49;

    // Move rook from h1 to g1 (0,7 -> 0,6). This is a non-pawn, non-capture move.
    let result = chess_logic::validate_and_apply_move(
        &mut game, 0, 7, 0, 6, PlayerColor::White, None,
    );
    assert!(result.is_ok());
    // halfmove_clock was 49, incremented by 1 -> 50. 50 < 100, so Normal.
    assert_eq!(game.halfmove_clock, 50);
    assert_eq!(result.unwrap(), MoveResult::Normal);
}

/// Threefold repetition NOT triggered after the second occurrence.
/// Position returns after 4 moves of knight-dance — only 2 occurrences so far.
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

    // Move 4 (B): N(5,5)->(7,6) — position returns to initial. First occurrence.
    let r4 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r4.is_ok() && r4.unwrap() == MoveResult::Normal);

    // Move 5 (W): N(0,1)->(2,2) — repeats move 1.
    let r5 = chess_logic::validate_and_apply_move(
        &mut game, 0, 1, 2, 2, PlayerColor::White, None,
    );
    assert!(r5.is_ok() && r5.unwrap() == MoveResult::Normal);

    // Move 6 (B): N(7,6)->(5,5) — repeats move 2.
    let r6 = chess_logic::validate_and_apply_move(
        &mut game, 7, 6, 5, 5, PlayerColor::Black, None,
    );
    assert!(r6.is_ok() && r6.unwrap() == MoveResult::Normal);

    // Move 7 (W): N(2,2)->(0,1) — repeats move 3.
    let r7 = chess_logic::validate_and_apply_move(
        &mut game, 2, 2, 0, 1, PlayerColor::White, None,
    );
    assert!(r7.is_ok() && r7.unwrap() == MoveResult::Normal);

    // Move 8 (B): N(5,5)->(7,6) — second occurrence of initial position (not 3).
    let r8 = chess_logic::validate_and_apply_move(
        &mut game, 5, 5, 7, 6, PlayerColor::Black, None,
    );
    assert!(r8.is_ok());
    // Only 2 occurrences — should NOT trigger threefold repetition.
    assert_eq!(r8.unwrap(), MoveResult::Normal);
}

// ===========================================================================
// ZOBRIST HASH Tests
// ===========================================================================

/// Two different board positions produce different hashes.
#[test]
fn zobrist_hash_different_positions_different_hashes() {
    let board1 = chess_logic::initialize_chess_board();

    // board2: same as board1 but move white pawn e2->e4
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

/// Same board, same castling rights, same en passant target, same turn
/// produces the same hash (deterministic).
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
