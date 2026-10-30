// Differential tests for the optimised attack and legal-move scans.
//
// `is_square_attacked` used to scan all 64 squares for an attacker and
// `are_no_legal_moves` tried all 64×64 from/to pairs. Both now look only at
// the squares that matter. These tests compare the new functions against
// brute-force references on thousands of pseudo-random positions, so the
// compute-unit savings cannot change a single rule.

use anchor_lang::prelude::Pubkey;
use magic_chess::state::*;
use magic_chess::utils::chess_logic;

type Board = [[Option<Piece>; 8]; 8];

/// Small deterministic PRNG (xorshift64*), so failures are reproducible.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

const PIECES: [PieceType; 6] = [
    PieceType::Pawn,
    PieceType::Knight,
    PieceType::Bishop,
    PieceType::Rook,
    PieceType::Queen,
    PieceType::King,
];

/// A random position with exactly one king per side and up to 24 other
/// pieces. Pawns never sit on the first or last rank.
fn random_board(rng: &mut Rng) -> Board {
    let mut board: Board = [[None; 8]; 8];
    let mut place_king = |color: PlayerColor, board: &mut Board| loop {
        let (r, c) = (rng.below(8) as usize, rng.below(8) as usize);
        if board[r][c].is_none() {
            board[r][c] = Some(Piece { piece_type: PieceType::King, color });
            return;
        }
    };
    place_king(PlayerColor::White, &mut board);
    place_king(PlayerColor::Black, &mut board);
    let extra = rng.below(25);
    for _ in 0..extra {
        let (r, c) = (rng.below(8) as usize, rng.below(8) as usize);
        if board[r][c].is_some() {
            continue;
        }
        let piece_type = PIECES[rng.below(5) as usize]; // no extra kings
        if piece_type == PieceType::Pawn && (r == 0 || r == 7) {
            continue;
        }
        let color = if rng.below(2) == 0 { PlayerColor::White } else { PlayerColor::Black };
        board[r][c] = Some(Piece { piece_type, color });
    }
    board
}

fn random_castling(rng: &mut Rng) -> CastlingRights {
    CastlingRights {
        white_kingside: rng.below(2) == 0,
        white_queenside: rng.below(2) == 0,
        black_kingside: rng.below(2) == 0,
        black_queenside: rng.below(2) == 0,
    }
}

fn random_en_passant(rng: &mut Rng, to_move: PlayerColor) -> Option<EnPassantSquare> {
    if rng.below(4) != 0 {
        return None;
    }
    // The capturable pawn just double-pushed: the target square is on rank 6
    // (row 5) when White is to move and rank 3 (row 2) when Black is.
    let row = if to_move == PlayerColor::White { 5 } else { 2 };
    Some(EnPassantSquare { row, col: rng.below(8) as u8 })
}

// ── Brute-force references ────────────────────────────────────────────────

fn path_clear(board: &Board, fr: i8, fc: i8, tr: i8, tc: i8) -> bool {
    let (dr, dc) = ((tr - fr).signum(), (tc - fc).signum());
    let (mut r, mut c) = (fr + dr, fc + dc);
    while (r, c) != (tr, tc) {
        if board[r as usize][c as usize].is_some() {
            return false;
        }
        r += dr;
        c += dc;
    }
    true
}

/// Every attacker piece in turn, with the attack geometry written out
/// independently of the implementation under test.
fn reference_attacked(board: &Board, tr: u8, tc: u8, attacker: PlayerColor) -> bool {
    let (tr, tc) = (tr as i8, tc as i8);
    for r in 0..8i8 {
        for c in 0..8i8 {
            let Some(p) = board[r as usize][c as usize] else { continue };
            if p.color != attacker {
                continue;
            }
            let (dr, dc) = (tr - r, tc - c);
            if (dr, dc) == (0, 0) {
                continue; // a piece does not attack the square it stands on
            }
            let hit = match p.piece_type {
                PieceType::Pawn => {
                    let dir = if attacker == PlayerColor::White { 1 } else { -1 };
                    dr == dir && dc.abs() == 1
                }
                PieceType::Knight => (dr.abs() == 2 && dc.abs() == 1) || (dr.abs() == 1 && dc.abs() == 2),
                PieceType::King => dr.abs() <= 1 && dc.abs() <= 1 && (dr, dc) != (0, 0),
                PieceType::Rook => (dr == 0 || dc == 0) && path_clear(board, r, c, tr, tc),
                PieceType::Bishop => dr.abs() == dc.abs() && path_clear(board, r, c, tr, tc),
                PieceType::Queen => {
                    (dr == 0 || dc == 0 || dr.abs() == dc.abs()) && path_clear(board, r, c, tr, tc)
                }
            };
            if hit {
                return true;
            }
        }
    }
    false
}

fn make_match(board: Board, to_move: PlayerColor, castling: CastlingRights, ep: Option<EnPassantSquare>) -> ChessMatch {
    ChessMatch {
        match_id: "equivalence".to_string(),
        players: [Pubkey::new_unique(), Pubkey::new_unique()],
        current_player_idx: 0,
        current_turn: to_move,
        last_move_timestamp: 0,
        move_timeout_duration: 600,
        game_status: GameStatus::Active,
        game_end_reason: None,
        board,
        castling_rights: castling,
        en_passant_target: ep,
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
        white_session_signer: Pubkey::default(),
        white_session_expires_at: 0,
        black_session_signer: Pubkey::default(),
        black_session_expires_at: 0,
        active_task_id: -1,
        bump: 0,
        match_escrow_bump: 0,
    }
}

/// A move is legal iff the full validator accepts it. Trying all 64×64
/// pairs is the definition the optimised scan has to match.
fn reference_has_legal_move(template: &ChessMatch) -> bool {
    for from in 0..64u8 {
        for to in 0..64u8 {
            if from == to {
                continue;
            }
            let mut game = make_match(template.board, template.current_turn, template.castling_rights, template.en_passant_target);
            if chess_logic::validate_and_apply_move(&mut game, from / 8, from % 8, to / 8, to % 8, template.current_turn, None).is_ok() {
                return true;
            }
        }
    }
    false
}

// ── Tests ────────────────────────────────────────────────────────────────

#[test]
fn square_attacked_matches_brute_force_on_random_positions() {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    for _ in 0..3_000 {
        let board = random_board(&mut rng);
        for attacker in [PlayerColor::White, PlayerColor::Black] {
            for r in 0..8u8 {
                for c in 0..8u8 {
                    assert_eq!(
                        chess_logic::is_square_attacked(&board, r, c, attacker),
                        reference_attacked(&board, r, c, attacker),
                        "attack mismatch at ({r},{c}) by {attacker:?} on {board:?}"
                    );
                }
            }
        }
    }
}

#[test]
fn square_attacked_matches_brute_force_on_the_starting_position() {
    let board = chess_logic::initialize_chess_board();
    for attacker in [PlayerColor::White, PlayerColor::Black] {
        for r in 0..8u8 {
            for c in 0..8u8 {
                assert_eq!(
                    chess_logic::is_square_attacked(&board, r, c, attacker),
                    reference_attacked(&board, r, c, attacker)
                );
            }
        }
    }
}

#[test]
fn no_legal_moves_matches_brute_force_on_random_positions() {
    let mut rng = Rng(0xD1B5_4A32_D192_ED03);
    let mut terminal_positions = 0;
    for _ in 0..1_500 {
        let board = random_board(&mut rng);
        let to_move = if rng.below(2) == 0 { PlayerColor::White } else { PlayerColor::Black };
        let castling = random_castling(&mut rng);
        let ep = random_en_passant(&mut rng, to_move);
        let game = make_match(board, to_move, castling, ep);
        let fast = chess_logic::are_no_legal_moves(&game.board, to_move, &game.castling_rights, game.en_passant_target);
        let slow = !reference_has_legal_move(&game);
        assert_eq!(fast, slow, "legal-move mismatch for {to_move:?} on {board:?} (castling {castling:?}, ep {ep:?})");
        if fast {
            terminal_positions += 1;
        }
    }
    // Random positions are rarely mate or stalemate, but the sample must contain some.
    assert!(terminal_positions > 0, "the sample never produced a terminal position");
}

#[test]
fn no_legal_moves_on_known_positions() {
    // Fool's mate: White is mated.
    let mut board: Board = [[None; 8]; 8];
    let put = |board: &mut Board, r: usize, c: usize, piece_type: PieceType, color: PlayerColor| {
        board[r][c] = Some(Piece { piece_type, color });
    };
    put(&mut board, 0, 4, PieceType::King, PlayerColor::White);
    put(&mut board, 2, 5, PieceType::Pawn, PlayerColor::White); // f3
    put(&mut board, 3, 6, PieceType::Pawn, PlayerColor::White); // g4
    put(&mut board, 1, 3, PieceType::Pawn, PlayerColor::White);
    put(&mut board, 1, 4, PieceType::Pawn, PlayerColor::White);
    put(&mut board, 0, 3, PieceType::Queen, PlayerColor::White);
    put(&mut board, 0, 5, PieceType::Bishop, PlayerColor::White);
    put(&mut board, 0, 6, PieceType::Knight, PlayerColor::White);
    put(&mut board, 3, 7, PieceType::Queen, PlayerColor::Black); // Qh4#
    put(&mut board, 7, 4, PieceType::King, PlayerColor::Black);
    let rights = CastlingRights::new();
    assert!(chess_logic::are_no_legal_moves(&board, PlayerColor::White, &rights, None));
    assert!(chess_logic::is_king_in_check(&board, PlayerColor::White));

    // Stalemate: Black king on h8, White queen on g6, White king on f7... the
    // classic K+Q vs K stalemate.
    let mut board: Board = [[None; 8]; 8];
    put(&mut board, 7, 7, PieceType::King, PlayerColor::Black);
    put(&mut board, 5, 6, PieceType::Queen, PlayerColor::White);
    put(&mut board, 5, 5, PieceType::King, PlayerColor::White);
    assert!(chess_logic::are_no_legal_moves(&board, PlayerColor::Black, &rights, None));
    assert!(!chess_logic::is_king_in_check(&board, PlayerColor::Black));

    // The starting position has plenty of moves.
    let board = chess_logic::initialize_chess_board();
    let rights = CastlingRights::default();
    assert!(!chess_logic::are_no_legal_moves(&board, PlayerColor::White, &rights, None));
}
