// src/utils/chess_logic.rs
use anchor_lang::prelude::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, MoveResult, PlayerColor, PieceType, EnPassantSquare, Piece, CastlingRights}; // Ensure all used state types are here

pub fn initialize_chess_board() -> [[Option<Piece>; 8]; 8] {
    let mut board = [[None; 8]; 8];
    
    for col in 0..8 {
        board[1][col] = Some(Piece { piece_type: PieceType::Pawn, color: PlayerColor::White });
        board[6][col] = Some(Piece { piece_type: PieceType::Pawn, color: PlayerColor::Black });
    }
    
    let back_row_types = [
        PieceType::Rook, PieceType::Knight, PieceType::Bishop, PieceType::Queen,
        PieceType::King, PieceType::Bishop, PieceType::Knight, PieceType::Rook,
    ];
    
    // Corrected loop for white back row
    for (col, &piece_type) in back_row_types.iter().enumerate() {
        board[0][col] = Some(Piece { piece_type, color: PlayerColor::White });
    }
    
    for (col, &piece_type) in back_row_types.iter().enumerate() {
        board[7][col] = Some(Piece { piece_type, color: PlayerColor::Black });
    }
    board
}

// --- Main function to validate and apply a chess move ---
pub fn validate_and_apply_move(
    game_state: &mut ChessMatch,
    from_row: u8,
    from_col: u8,
    to_row: u8,
    to_col: u8,
    player_color: PlayerColor, // Should match game_state.current_turn when called
    promotion: Option<PieceType>,
) -> Result<MoveResult> {
    // 0. Consistency check (optional but good practice)
    if game_state.current_turn != player_color {
        msg!("Inconsistency: player_color arg ({:?}) does not match game_state.current_turn ({:?})", player_color, game_state.current_turn);
        return err!(ChessError::NotYourTurn); // Or a more specific internal error
    }

    // 1. Basic pre-move validations
    if from_row > 7 || from_col > 7 || to_row > 7 || to_col > 7 {
        return err!(ChessError::InvalidMoveOutOfBounds);
    }
    if from_row == to_row && from_col == to_col {
        return err!(ChessError::InvalidMoveIllegalPieceMovement);
    }

    let source_piece_data = game_state.board[from_row as usize][from_col as usize]
        .as_ref()
        .cloned() // Clone to avoid issues if game_state.board is modified before this is used again
        .ok_or(error!(ChessError::InvalidMoveEmptySource))?;

    if source_piece_data.color != player_color {
        return err!(ChessError::InvalidMoveNotYourPiece);
    }

    let mut is_capture = false;
    if let Some(target_piece_data) = game_state.board[to_row as usize][to_col as usize].as_ref() {
        if target_piece_data.color == player_color {
            return err!(ChessError::InvalidMoveCannotCaptureOwnPiece);
        }
        is_capture = true;
    }

    // 2. Validate piece-specific movement rules
    if !is_legal_move_for_piece(
        &game_state.board,
        &source_piece_data,
        from_row, from_col, to_row, to_col,
        game_state.en_passant_target,
        &game_state.castling_rights,
        player_color,
    ) {
        return err!(ChessError::InvalidMoveIllegalPieceMovement);
    }

    let piece_type_moved = source_piece_data.piece_type;

    // 3. Simulate the move and check if it leaves own king in check
    let mut temp_board = game_state.board; // Copy board for simulation
    let piece_to_move_temp = temp_board[from_row as usize][from_col as usize].take().unwrap();
    
    if piece_to_move_temp.piece_type == PieceType::Pawn {
        if let Some(ep_square) = game_state.en_passant_target {
            if ep_square.row == to_row && ep_square.col == to_col &&
               (to_col as i8 - from_col as i8).abs() == 1 &&
               (to_row as i8 - from_row as i8).abs() == 1
            {
                let captured_pawn_row = if player_color == PlayerColor::White { to_row - 1 } else { to_row + 1 };
                temp_board[captured_pawn_row as usize][to_col as usize].take();
            }
        }
    }
    if piece_to_move_temp.piece_type == PieceType::King && (to_col as i8 - from_col as i8).abs() == 2 {
        let (rook_from_col, rook_to_col) = if (to_col as i8 - from_col as i8) > 0 { (7, 5) } else { (0, 3) };
        if let Some(rook) = temp_board[from_row as usize][rook_from_col as usize].take() {
            temp_board[from_row as usize][rook_to_col as usize] = Some(rook);
        }
    }
    let _captured_piece_temp = temp_board[to_row as usize][to_col as usize].replace(piece_to_move_temp);

    if is_king_in_check(&temp_board, player_color) {
        return err!(ChessError::InvalidMoveLeavesKingInCheck);
    }

    // --- Apply the move permanently to game_state ---
    let previous_en_passant_target = game_state.en_passant_target.take(); 

    let mut actual_captured_piece = game_state.board[to_row as usize][to_col as usize].take();
    if piece_type_moved == PieceType::Pawn {
        if let Some(ep_square) = previous_en_passant_target {
            if ep_square.row == to_row && ep_square.col == to_col &&
               (to_col as i8 - from_col as i8).abs() == 1 &&
               (to_row as i8 - from_row as i8).abs() == 1
            {
                let captured_pawn_row = if player_color == PlayerColor::White { to_row - 1 } else { to_row + 1 };
                actual_captured_piece = game_state.board[captured_pawn_row as usize][to_col as usize].take();
                is_capture = true; 
            }
        }
    }

    let mut piece_to_move_actual = game_state.board[from_row as usize][from_col as usize].take().unwrap();

    update_castling_rights(&mut game_state.castling_rights, &piece_to_move_actual, from_row, from_col);

    // Revoke castling right if a piece was captured on a rook's starting square
    // (e.g., rook captured without ever moving — the right must die with the rook)
    if let Some(ref captured) = actual_captured_piece {
        if captured.piece_type == PieceType::Rook {
            let rights = &mut game_state.castling_rights;
            match (to_row, to_col) {
                (0, 0) => rights.white_queenside = false,
                (0, 7) => rights.white_kingside = false,
                (7, 0) => rights.black_queenside = false,
                (7, 7) => rights.black_kingside = false,
                _ => {} // capture not on a corner — no castling right to revoke
            }
        }
    }

    if piece_to_move_actual.piece_type == PieceType::King {
        let col_diff = to_col as i8 - from_col as i8;
        if col_diff.abs() == 2 { 
            let (rook_from_col, rook_to_col) = if col_diff > 0 { (7, 5) } else { (0, 3) };
            if let Some(rook_piece) = game_state.board[from_row as usize][rook_from_col as usize].take() {
                game_state.board[from_row as usize][rook_to_col as usize] = Some(rook_piece);
            } else { return err!(ChessError::InvalidMoveIllegalPieceMovement); }
        }
    }
    
    if piece_to_move_actual.piece_type == PieceType::Pawn {
        if (player_color == PlayerColor::White && to_row == 7) || 
           (player_color == PlayerColor::Black && to_row == 0) {
            match promotion {
                Some(PieceType::Queen) | Some(PieceType::Rook) | Some(PieceType::Bishop) | Some(PieceType::Knight) => {
                    piece_to_move_actual.piece_type = promotion.unwrap();
                }
                Some(_) => return err!(ChessError::InvalidPromotionPiece),
                None => piece_to_move_actual.piece_type = PieceType::Queen,
            }
        } else if promotion.is_some() { return err!(ChessError::InvalidPromotionNotOnLastRank); }
    } else if promotion.is_some() { return err!(ChessError::InvalidPromotionNotAPawn); }

    game_state.board[to_row as usize][to_col as usize] = Some(piece_to_move_actual);

    if piece_type_moved == PieceType::Pawn && (to_row as i8 - from_row as i8).abs() == 2 {
        let ep_row = (from_row as i8 + to_row as i8) / 2;
        game_state.en_passant_target = Some(EnPassantSquare { row: ep_row as u8, col: from_col });
    }

    if piece_type_moved == PieceType::Pawn || is_capture || actual_captured_piece.is_some() {
        game_state.halfmove_clock = 0;
    } else {
        game_state.halfmove_clock += 1;
    }

    if player_color == PlayerColor::Black {
        game_state.fullmove_number += 1;
    }
    game_state.current_turn = player_color.opponent(); // Switch turn

    // --- Record position hash for threefold repetition detection ---
    let current_hash = compute_zobrist_hash(
        &game_state.board,
        &game_state.castling_rights,
        game_state.en_passant_target,
        game_state.current_turn,
    );
    push_position_hash(&mut game_state.position_history, current_hash);

    // --- Determine game result for the opponent (whose turn it now is) ---
    let opponent_color = game_state.current_turn; 
    if are_no_legal_moves(
        &game_state.board, 
        opponent_color, 
        &game_state.castling_rights,
        game_state.en_passant_target 
    ) {
        if is_king_in_check(&game_state.board, opponent_color) {
            return Ok(MoveResult::Checkmate);
        } else {
            return Ok(MoveResult::Stalemate);
        }
    }

    if game_state.halfmove_clock >= 100 {
        return Ok(MoveResult::FiftyMoveRule);
    }

    if is_insufficient_material(&game_state.board) {
        return Ok(MoveResult::InsufficientMaterial);
    }

    if is_threefold_repetition(&game_state.position_history, current_hash) {
        return Ok(MoveResult::ThreefoldRepetition);
    }

    Ok(MoveResult::Normal)
}

// --- Function to check if a player has ANY legal moves ---
fn are_no_legal_moves(
    board: &[[Option<Piece>; 8]; 8], // Takes immutable board ref
    player_color: PlayerColor,
    castling_rights: &CastlingRights, // Takes immutable castling_rights ref
    en_passant_target: Option<EnPassantSquare>, // Takes EP by value (it's Copy)
) -> bool {
    for r_from_idx in 0..8 {
        for c_from_idx in 0..8 {
            if let Some(piece) = &board[r_from_idx][c_from_idx] {
                if piece.color == player_color {
                    for r_to_idx in 0..8 {
                        for c_to_idx in 0..8 {
                            let (from_r, from_c, to_r, to_c) = (r_from_idx as u8, c_from_idx as u8, r_to_idx as u8, c_to_idx as u8);
                            if from_r == to_r && from_c == to_c { continue; }

                            if is_legal_move_for_piece(board, piece, from_r, from_c, to_r, to_c, en_passant_target, castling_rights, player_color) {
                                let mut temp_board = *board; 
                                let temp_piece_to_move = temp_board[r_from_idx][c_from_idx].take().unwrap();
                                
                                if temp_piece_to_move.piece_type == PieceType::Pawn {
                                    if let Some(ep_square) = en_passant_target {
                                        if ep_square.row == to_r && ep_square.col == to_c &&
                                           (c_to_idx as i8 - c_from_idx as i8).abs() == 1 &&
                                           (r_to_idx as i8 - r_from_idx as i8).abs() == 1
                                        {
                                            let captured_pawn_row = if player_color == PlayerColor::White { to_r - 1 } else { to_r + 1 };
                                            temp_board[captured_pawn_row as usize][c_to_idx].take();
                                        }
                                    }
                                }
                                if temp_piece_to_move.piece_type == PieceType::King && (c_to_idx as i8 - c_from_idx as i8).abs() == 2 {
                                    let (rook_from_col, rook_to_col) = if (c_to_idx as i8 - c_from_idx as i8) > 0 { (7, 5) } else { (0, 3) };
                                    if let Some(rook) = temp_board[r_from_idx][rook_from_col as usize].take() {
                                        temp_board[r_from_idx][rook_to_col as usize] = Some(rook);
                                    }
                                }
                                temp_board[r_to_idx][c_to_idx] = Some(temp_piece_to_move);

                                if !is_king_in_check(&temp_board, player_color) {
                                    return false; 
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    true 
}

// --- Insufficient Material Detection ---
pub fn is_insufficient_material(board: &[[Option<Piece>; 8]; 8]) -> bool {
    let mut white_bishops = 0u8;
    let mut black_bishops = 0u8;
    let mut white_knights = 0u8;
    let mut black_knights = 0u8;
    let mut white_other = 0u8;
    let mut black_other = 0u8;
    // Count bishops on light-colored squares of the chessboard (NOT player White).
    // A bishop never changes square color; two same-colored bishops cannot force checkmate.
    let mut white_bishops_on_light: u8 = 0;
    let mut black_bishops_on_light: u8 = 0;

    for row in 0..8 {
        for col in 0..8 {
            if let Some(piece) = &board[row][col] {
                match piece.piece_type {
                    PieceType::Bishop => {
                        let square_is_light = (row + col) % 2 == 0;
                        if piece.color == PlayerColor::White {
                            white_bishops += 1;
                            if square_is_light { white_bishops_on_light += 1; }
                        } else {
                            black_bishops += 1;
                            if square_is_light { black_bishops_on_light += 1; }
                        }
                    }
                    PieceType::Knight => {
                        if piece.color == PlayerColor::White {
                            white_knights += 1;
                        } else {
                            black_knights += 1;
                        }
                    }
                    PieceType::King => {}
                    _ => {
                        if piece.color == PlayerColor::White {
                            white_other += 1;
                        } else {
                            black_other += 1;
                        }
                    }
                }
            }
        }
    }

    if white_other > 0 || black_other > 0 {
        return false;
    }

    let white_pieces = white_bishops + white_knights;
    let black_pieces = black_bishops + black_knights;

    // K vs K
    if white_pieces == 0 && black_pieces == 0 {
        return true;
    }

    // K+B vs K
    if white_bishops == 1 && white_knights == 0 && black_pieces == 0 {
        return true;
    }
    if black_bishops == 1 && black_knights == 0 && white_pieces == 0 {
        return true;
    }

    // K+N vs K
    if white_knights == 1 && white_bishops == 0 && black_pieces == 0 {
        return true;
    }
    if black_knights == 1 && black_bishops == 0 && white_pieces == 0 {
        return true;
    }

    // K+B vs K+B where bishops are on same color squares
    if white_bishops == 1 && white_knights == 0 && black_bishops == 1 && black_knights == 0 {
        let w_on_light = white_bishops_on_light == 1;
        let b_on_light = black_bishops_on_light == 1;
        if w_on_light == b_on_light {
            return true;
        }
    }

    // K+B+B vs K: both bishops on same square color → cannot force checkmate.
    // 2 bishops same color means both on light (on_light==2) or both on dark (on_light==0).
    if white_bishops == 2 && white_knights == 0 && black_pieces == 0 {
        if white_bishops_on_light == 0 || white_bishops_on_light == 2 {
            return true;
        }
    }
    if black_bishops == 2 && black_knights == 0 && white_pieces == 0 {
        if black_bishops_on_light == 0 || black_bishops_on_light == 2 {
            return true;
        }
    }

    false
}

// --- Piece-Specific Movement Validation ---
fn is_legal_move_for_piece(
    board: &[[Option<Piece>; 8]; 8], // Takes immutable board ref
    piece_data: &Piece,
    from_r: u8, from_c: u8,
    to_r: u8, to_c: u8,
    en_passant_target: Option<EnPassantSquare>, // Takes EP by value
    castling_rights: &CastlingRights,   // Takes immutable castling_rights ref
    current_player_color: PlayerColor,
) -> bool {
    if let Some(target_piece) = board[to_r as usize][to_c as usize] {
        if target_piece.color == piece_data.color {
            return false; 
        }
    }

    match piece_data.piece_type {
        PieceType::Pawn => is_valid_pawn_move(board, piece_data.color, from_r, from_c, to_r, to_c, en_passant_target),
        PieceType::Rook => is_valid_rook_move(board, from_r, from_c, to_r, to_c),
        PieceType::Knight => is_valid_knight_move(from_r, from_c, to_r, to_c),
        PieceType::Bishop => is_valid_bishop_move(board, from_r, from_c, to_r, to_c),
        PieceType::Queen => is_valid_queen_move(board, from_r, from_c, to_r, to_c),
        PieceType::King => {
            is_valid_king_move_basic(from_r, from_c, to_r, to_c) || 
            is_valid_castling_move(board, from_r, from_c, to_r, to_c, castling_rights, current_player_color)
        },
    }
}

fn is_valid_pawn_move(
    board: &[[Option<Piece>; 8]; 8],
    color: PlayerColor,
    from_r: u8, from_c: u8,
    to_r: u8, to_c: u8,
    en_passant_target: Option<EnPassantSquare>,
) -> bool {
    let (fr, fc, tr, tc) = (from_r as i8, from_c as i8, to_r as i8, to_c as i8);
    let direction: i8 = if color == PlayerColor::White { 1 } else { -1 };

    if tc == fc && tr == fr + direction && board[to_r as usize][to_c as usize].is_none() { return true; }
    if tc == fc && ( (color == PlayerColor::White && fr == 1 && tr == fr + 2 * direction) ||
        (color == PlayerColor::Black && fr == 6 && tr == fr + 2 * direction) ) &&
        board[to_r as usize][to_c as usize].is_none() && board[(fr + direction) as usize][fc as usize].is_none() { return true; }
    if (tc == fc + 1 || tc == fc - 1) && tr == fr + direction {
        if let Some(target_piece) = &board[to_r as usize][to_c as usize] {
            if target_piece.color != color { return true; }
        }
    }
    
    if let Some(ep_square) = en_passant_target {
        if ep_square.row == to_r && ep_square.col == to_c && 
           (tc == fc + 1 || tc == fc - 1) && 
           tr == fr + direction 
        {
            return true;
        }
    }
    false
}

fn is_valid_king_move_basic(from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    let dr = (to_r as i8 - from_r as i8).abs();
    let dc = (to_c as i8 - from_c as i8).abs();
    (dr <= 1 && dc <= 1) && (dr != 0 || dc != 0)
}

fn is_valid_rook_move(board: &[[Option<Piece>; 8]; 8], from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    if from_r == to_r || from_c == to_c { return is_path_clear_linear(board, from_r, from_c, to_r, to_c); }
    false
}
fn is_valid_knight_move(from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    let dr = (to_r as i8 - from_r as i8).abs(); let dc = (to_c as i8 - from_c as i8).abs();
    (dr == 2 && dc == 1) || (dr == 1 && dc == 2)
}
fn is_valid_bishop_move(board: &[[Option<Piece>; 8]; 8], from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    if (to_r as i8 - from_r as i8).abs() == (to_c as i8 - from_c as i8).abs() {
        return is_path_clear_diagonal(board, from_r, from_c, to_r, to_c);
    }
    false
}
fn is_valid_queen_move(board: &[[Option<Piece>; 8]; 8], from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    if from_r == to_r || from_c == to_c { return is_path_clear_linear(board, from_r, from_c, to_r, to_c); }
    if (to_r as i8 - from_r as i8).abs() == (to_c as i8 - from_c as i8).abs() {
        return is_path_clear_diagonal(board, from_r, from_c, to_r, to_c);
    }
    false
}

// --- Castling Logic ---
fn update_castling_rights(rights: &mut CastlingRights, moved_piece: &Piece, from_r: u8, from_c: u8) {
    if moved_piece.piece_type == PieceType::King {
        if moved_piece.color == PlayerColor::White {
            rights.white_kingside = false; rights.white_queenside = false;
        } else {
            rights.black_kingside = false; rights.black_queenside = false;
        }
    } else if moved_piece.piece_type == PieceType::Rook {
        if moved_piece.color == PlayerColor::White {
            if from_r == 0 && from_c == 0 { rights.white_queenside = false; }
            if from_r == 0 && from_c == 7 { rights.white_kingside = false; }
        } else { // Black
            if from_r == 7 && from_c == 0 { rights.black_queenside = false; }
            if from_r == 7 && from_c == 7 { rights.black_kingside = false; }
        }
    }
}

fn is_valid_castling_move(
    board: &[[Option<Piece>; 8]; 8],
    from_r: u8, from_c: u8, to_r: u8, to_c: u8,
    rights: &CastlingRights, player_color: PlayerColor,
) -> bool {
    if from_r != to_r { return false; }
    let king_initial_row = if player_color == PlayerColor::White { 0 } else { 7 };
    if from_r != king_initial_row || from_c != 4 { return false; } 
    if is_king_in_check(board, player_color) { return false; }

    let attacker_color = player_color.opponent();

    if to_c == 6 { // Kingside (G file)
        let can_castle = if player_color == PlayerColor::White { rights.white_kingside } else { rights.black_kingside };
        if !can_castle { return false; }
        if board[king_initial_row as usize][5].is_some() || board[king_initial_row as usize][6].is_some() { return false; }
        if is_square_attacked(board, king_initial_row, 5, attacker_color) || 
           is_square_attacked(board, king_initial_row, 6, attacker_color) { return false; }
        // Verify rook exists on its starting square (h1/h8)
        match &board[king_initial_row as usize][7] {
            Some(p) if p.piece_type == PieceType::Rook && p.color == player_color => {},
            _ => return false,
        }
        return true;
    } else if to_c == 2 { // Queenside (C file)
        let can_castle = if player_color == PlayerColor::White { rights.white_queenside } else { rights.black_queenside };
        if !can_castle { return false; }
        if board[king_initial_row as usize][3].is_some() || board[king_initial_row as usize][2].is_some() || board[king_initial_row as usize][1].is_some() { return false; }
        if is_square_attacked(board, king_initial_row, 3, attacker_color) || 
           is_square_attacked(board, king_initial_row, 2, attacker_color) { return false; }
        // Verify rook exists on its starting square (a1/a8)
        match &board[king_initial_row as usize][0] {
            Some(p) if p.piece_type == PieceType::Rook && p.color == player_color => {},
            _ => return false,
        }
        return true;
    }
    false
}

// --- Path Clearing Helpers ---
fn is_path_clear_linear(board: &[[Option<Piece>; 8]; 8], from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    if from_r == to_r {
        let start_col = std::cmp::min(from_c, to_c) + 1; let end_col = std::cmp::max(from_c, to_c);
        for c in start_col..end_col { if board[from_r as usize][c as usize].is_some() { return false; } }
    } else if from_c == to_c {
        let start_row = std::cmp::min(from_r, to_r) + 1; let end_row = std::cmp::max(from_r, to_r);
        for r in start_row..end_row { if board[r as usize][from_c as usize].is_some() { return false; } }
    } else { return false; } 
    true
}
fn is_path_clear_diagonal(board: &[[Option<Piece>; 8]; 8], from_r: u8, from_c: u8, to_r: u8, to_c: u8) -> bool {
    let dr_total = to_r as i8 - from_r as i8; let dc_total = to_c as i8 - from_c as i8;
    if dr_total.abs() != dc_total.abs() || dr_total == 0 { return false; }
    let dr_step = dr_total.signum(); let dc_step = dc_total.signum();
    let mut r = from_r as i8 + dr_step; let mut c = from_c as i8 + dc_step;
    while r != to_r as i8 || c != to_c as i8 {
        if board[r as usize][c as usize].is_some() { return false; }
        r += dr_step; c += dc_step;
    }
    true
}

// --- Check Detection Helpers ---
fn find_king(board: &[[Option<Piece>; 8]; 8], king_color: PlayerColor) -> Result<(u8, u8)> {
    for r_idx in 0..8 { for c_idx in 0..8 {
        if let Some(p) = &board[r_idx][c_idx] {
            if p.piece_type == PieceType::King && p.color == king_color { return Ok((r_idx as u8, c_idx as u8)); }
        }
    }}
    err!(ChessError::KingNotFound)
}

fn can_pawn_attack(p_r: u8, p_c: u8, t_r: u8, t_c: u8, attacker_color: PlayerColor) -> bool {
    let dir: i8 = if attacker_color == PlayerColor::White { 1 } else { -1 };
    (t_c as i8 == p_c as i8 + 1 || t_c as i8 == p_c as i8 - 1) && t_r as i8 == p_r as i8 + dir
}

fn can_knight_attack(k_r: u8, k_c: u8, t_r: u8, t_c: u8) -> bool {
    let dr = (t_r as i8 - k_r as i8).abs(); let dc = (t_c as i8 - k_c as i8).abs();
    (dr == 2 && dc == 1) || (dr == 1 && dc == 2)
}

fn can_king_attack(k_r: u8, k_c: u8, t_r: u8, t_c: u8) -> bool {
    let dr = (t_r as i8 - k_r as i8).abs(); let dc = (t_c as i8 - k_c as i8).abs();
    dr <= 1 && dc <= 1 && (dr != 0 || dc != 0)
}

fn can_slider_attack(
    board: &[[Option<Piece>; 8]; 8],
    s_r: u8, s_c: u8, t_r: u8, t_c: u8,
    piece_type: PieceType
) -> bool {
    match piece_type {
        PieceType::Rook => {
            if s_r == t_r || s_c == t_c { 
                return is_path_clear_linear(board, s_r, s_c, t_r, t_c);
            }
        },
        PieceType::Bishop => {
            if (t_r as i8 - s_r as i8).abs() == (t_c as i8 - s_c as i8).abs() { 
                return is_path_clear_diagonal(board, s_r, s_c, t_r, t_c);
            }
        },
        PieceType::Queen => {
            if s_r == t_r || s_c == t_c {
                if is_path_clear_linear(board, s_r, s_c, t_r, t_c) { return true; }
            }
            if (t_r as i8 - s_r as i8).abs() == (t_c as i8 - s_c as i8).abs() {
                if is_path_clear_diagonal(board, s_r, s_c, t_r, t_c) { return true; }
            }
        },
        _ => return false, 
    }
    false
}

fn is_square_attacked(
    board: &[[Option<Piece>; 8]; 8],
    target_r: u8, target_c: u8,
    attacker_color: PlayerColor,
) -> bool {
    for r_from in 0..8 {
        for c_from in 0..8 {
            if let Some(attacker_piece) = &board[r_from as usize][c_from as usize] {
                if attacker_piece.color == attacker_color {
                    match attacker_piece.piece_type {
                        PieceType::Pawn => {
                            if can_pawn_attack(r_from as u8, c_from as u8, target_r, target_c, attacker_color) {
                                return true;
                            }
                        }
                        PieceType::Knight => {
                            if can_knight_attack(r_from as u8, c_from as u8, target_r, target_c) {
                                return true;
                            }
                        }
                        PieceType::King => {
                            if can_king_attack(r_from as u8, c_from as u8, target_r, target_c) {
                                return true;
                            }
                        }
                        PieceType::Rook | PieceType::Bishop | PieceType::Queen => {
                            if can_slider_attack(board, r_from as u8, c_from as u8, target_r, target_c, attacker_piece.piece_type) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

pub fn is_king_in_check(board: &[[Option<Piece>; 8]; 8], king_color: PlayerColor) -> bool {
    match find_king(board, king_color) {
        Ok((kr, kc)) => is_square_attacked(board, kr, kc, king_color.opponent()),
        Err(_) => true, // If king not found, treat as an error state / king effectively in check
    }
}

// --- Threefold Repetition Detection ---

// Max capacity for position_history Vec — must match MAX_POSITION_HISTORY in constants.rs
const POSITION_HISTORY_CAP: usize = 200;

/// Push a position hash into the history, evicting the oldest entry if at capacity.
pub fn push_position_hash(history: &mut Vec<u64>, hash: u64) {
    if history.len() >= POSITION_HISTORY_CAP {
        history.remove(0);
    }
    history.push(hash);
}

/// Compute a deterministic Zobrist-style hash of the full chess position.
/// Captures: piece placement, castling rights, en passant target, and side to move.
/// Uses FNV-1a 64-bit for compactness and speed on-chain.
pub fn compute_zobrist_hash(
    board: &[[Option<Piece>; 8]; 8],
    castling_rights: &CastlingRights,
    en_passant_target: Option<EnPassantSquare>,
    current_turn: PlayerColor,
) -> u64 {
    let mut data: [u8; 200] = [0u8; 200];
    let mut pos: usize = 0;

    for row in 0..8u8 {
        for col in 0..8u8 {
            if let Some(piece) = &board[row as usize][col as usize] {
                // Encode piece type, color, and square index into sequential bytes
                data[pos] = piece.piece_type as u8;
                pos += 1;
                data[pos] = piece.color as u8;
                pos += 1;
                data[pos] = row * 8 + col;
                pos += 1;
            }
        }
    }

    // Encode castling rights as a bit-packed byte
    let mut cr_byte = 0u8;
    if castling_rights.white_kingside  { cr_byte |= 1; }
    if castling_rights.white_queenside { cr_byte |= 2; }
    if castling_rights.black_kingside  { cr_byte |= 4; }
    if castling_rights.black_queenside { cr_byte |= 8; }
    data[pos] = cr_byte;
    pos += 1;

    // Encode en passant target: square index 0-63, or 64 for none
    if let Some(ep) = en_passant_target {
        data[pos] = ep.row * 8 + ep.col;
    } else {
        data[pos] = 64;
    }
    pos += 1;

    // Side to move
    data[pos] = current_turn as u8;
    pos += 1;

    fnv1a_hash_64(&data[..pos])
}

/// FNV-1a 64-bit hash of a byte slice.
fn fnv1a_hash_64(input: &[u8]) -> u64 {
    const OFFSET: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;
    let mut hash = OFFSET;
    for &byte in input {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

/// Returns true if the current position hash has appeared at least 3 times
/// in the position history (including the just-pushed entry).
pub fn is_threefold_repetition(position_history: &[u64], current_hash: u64) -> bool {
    let mut count = 0u8;
    for &h in position_history.iter() {
        if h == current_hash {
            count += 1;
            if count >= 3 {
                return true;
            }
        }
    }
    false
}

// --- FEN String Generation ---

fn piece_to_fen_char(piece: &Piece) -> char {
    match (piece.piece_type, piece.color) {
        (PieceType::King, PlayerColor::White) => 'K',
        (PieceType::Queen, PlayerColor::White) => 'Q',
        (PieceType::Rook, PlayerColor::White) => 'R',
        (PieceType::Bishop, PlayerColor::White) => 'B',
        (PieceType::Knight, PlayerColor::White) => 'N',
        (PieceType::Pawn, PlayerColor::White) => 'P',
        (PieceType::King, PlayerColor::Black) => 'k',
        (PieceType::Queen, PlayerColor::Black) => 'q',
        (PieceType::Rook, PlayerColor::Black) => 'r',
        (PieceType::Bishop, PlayerColor::Black) => 'b',
        (PieceType::Knight, PlayerColor::Black) => 'n',
        (PieceType::Pawn, PlayerColor::Black) => 'p',
    }
}

pub fn generate_fen(game_state: &ChessMatch) -> String {
    let mut placement = String::new();
    for row in (0..8).rev() {
        let mut empty = 0u8;
        for col in 0..8 {
            if let Some(piece) = &game_state.board[row][col] {
                if empty > 0 {
                    placement.push((b'0' + empty) as char);
                    empty = 0;
                }
                placement.push(piece_to_fen_char(piece));
            } else {
                empty += 1;
            }
        }
        if empty > 0 {
            placement.push((b'0' + empty) as char);
        }
        if row > 0 {
            placement.push('/');
        }
    }

    let active = if game_state.current_turn == PlayerColor::White { 'w' } else { 'b' };

    let mut castling = String::new();
    let cr = &game_state.castling_rights;
    if cr.white_kingside { castling.push('K'); }
    if cr.white_queenside { castling.push('Q'); }
    if cr.black_kingside { castling.push('k'); }
    if cr.black_queenside { castling.push('q'); }
    if castling.is_empty() {
        castling.push('-');
    }

    let ep = match game_state.en_passant_target {
        Some(sq) => {
            let mut s = String::new();
            s.push((b'a' + sq.col) as char);
            s.push((b'1' + sq.row) as char);
            s
        }
        None => String::from("-"),
    };

    format!("{} {} {} {} {} {}", placement, active, castling, ep, game_state.halfmove_clock, game_state.fullmove_number)
}
