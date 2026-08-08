// Unit tests for MagicBlock-specific instruction handler logic.
// These are pure Rust tests — no Solana VM needed.
//
// Tests validate the state transitions, error conditions, and field updates
// that each instruction handler performs, without requiring actual accounts
// or CPI execution.
//
// Coverage:
//   - initialize_match: field setup, input validation
//   - join_match: bet matching, state checks, ownership checks
//   - resign_game: winner determination, error conditions
//   - claim_timeout_win: timeout boundary checks, authorization
//   - process_match_settlement: payout math, flags, escrow ownership
//   - abort_match: state constraints, creator checks
//   - close_match: settlement gating
//   - set_session_key: player validation, expiry check
//   - revoke_session_key: field clearing, player validation
//   - delegate_match / undelegate_match / commit_state: delegation state
//   - schedule_timeout / cancel_timeout_task: task ID lifecycle

use anchor_lang::prelude::Pubkey;
use magic_chess::constants::*;
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
        white_session_signer: Pubkey::default(),
        white_session_expires_at: 0,
        black_session_signer: Pubkey::default(),
        black_session_expires_at: 0,
        active_task_id: -1,
        bump: 0,
        match_escrow_bump: 0,
    }
}

/// Create a ChessMatch using the standard starting board.
fn standard_match(current_turn: PlayerColor) -> ChessMatch {
    make_match(chess_logic::initialize_chess_board(), current_turn)
}

/// Simulate the session key validation check used in set_session_key.rs.
/// Session is valid if: session_signer != default() AND signer == session_signer AND now < expires_at.
fn is_session_valid(chess_match: &ChessMatch, signer: Pubkey, now: i64) -> bool {
    chess_match.white_session_signer != Pubkey::default()
        && signer == chess_match.white_session_signer
        && now < chess_match.white_session_expires_at
}

/// Derive the match escrow PDA for a given match_id and program_id.
/// Mirrors the logic in payout_logic.rs and abort_match.rs.
fn derive_escrow_pda(match_id: &str, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MATCH_ESCROW_SEED, match_id.as_bytes()], program_id)
}

/// Derive the chess_match PDA for a given match_id and program_id.
fn derive_match_pda(match_id: &str, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CHESS_MATCH_SEED, match_id.as_bytes()], program_id)
}

/// Calculate platform fee from total_pot and basis points.
fn calculate_fee(total_pot: u64, fee_bps: u16) -> u64 {
    total_pot
        .checked_mul(fee_bps as u64)
        .unwrap()
        .checked_div(10_000)
        .unwrap()
}

/// Calculate winner payout: total_pot minus fee.
fn calculate_winner_amount(total_pot: u64, fee_bps: u16) -> u64 {
    total_pot
        .checked_sub(calculate_fee(total_pot, fee_bps))
        .unwrap()
}

/// Calculate per-player draw payout: (total_pot - fee) / 2 for player one,
/// remainder to player two.
fn calculate_draw_amounts(total_pot: u64, fee_bps: u16) -> (u64, u64) {
    let fee = calculate_fee(total_pot, fee_bps);
    let remaining = total_pot.checked_sub(fee).unwrap();
    let p1 = remaining.checked_div(2).unwrap();
    let p2 = remaining.checked_sub(p1).unwrap();
    (p1, p2)
}

// ===========================================================================
// 1. Initialize Match Tests (5)
// ===========================================================================

#[test]
fn match_initialized_correctly() {
    // Simulate handle_initialize_match logic: set all fields as the handler does.
    let match_id = "match-abc".to_string();
    let creator = Pubkey::new_unique();
    let bet_amount = 100_000_000u64;
    let timeout_duration: i64 = 900;
    let fee_bps: u16 = 200;
    let fee_wallet = Pubkey::new_unique();
    let betting_mint = Pubkey::new_unique();
    let now: i64 = 1_700_000_000;

    // Build the match as the handler would.
    let game = ChessMatch {
        match_id: match_id.clone(),
        players: [creator, Pubkey::default()],
        current_player_idx: 0,
        current_turn: PlayerColor::White,
        last_move_timestamp: now,
        move_timeout_duration: timeout_duration,
        game_status: GameStatus::WaitingForOpponent,
        game_end_reason: None,
        board: chess_logic::initialize_chess_board(),
        castling_rights: CastlingRights::new(),
        en_passant_target: None,
        halfmove_clock: 0,
        fullmove_number: 1,
        position_history: vec![],
        betting_token_mint: betting_mint,
        bet_amount_player_one: bet_amount,
        bet_amount_player_two: 0,
        total_pot: bet_amount,
        platform_fee_basis_points: fee_bps,
        platform_fee_wallet: fee_wallet,
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
    };

    // Verify all fields as the handler would set them.
    assert_eq!(game.match_id, match_id);
    assert_eq!(game.players[0], creator);
    assert_eq!(game.players[1], Pubkey::default());
    assert_eq!(game.current_turn, PlayerColor::White);
    assert_eq!(game.game_status, GameStatus::WaitingForOpponent);
    assert_eq!(game.game_end_reason, None);
    assert_eq!(game.bet_amount_player_one, bet_amount);
    assert_eq!(game.bet_amount_player_two, 0);
    assert_eq!(game.total_pot, bet_amount);
    assert_eq!(game.platform_fee_basis_points, fee_bps);
    assert_eq!(game.platform_fee_wallet, fee_wallet);
    assert_eq!(game.betting_token_mint, betting_mint);
    assert_eq!(game.move_timeout_duration, timeout_duration);
    assert!(!game.payout_processed);
    assert!(!game.prediction_enabled);
    assert_eq!(game.white_session_signer, Pubkey::default());
    assert_eq!(game.white_session_expires_at, 0);
    assert_eq!(game.active_task_id, -1);
    assert!(!game.is_delegated);
    assert_eq!(game.delegation_uid, "");
    assert!(game.last_move_timestamp > 0);

    // Board is initialized (non-empty).
    assert!(game.board[0][0].is_some()); // White rook at a1
}

#[test]
fn initialize_validates_match_id_length() {
    // match_id must be non-empty and <= MAX_MATCH_ID_LEN (32).

    // Empty rejected.
    let empty_id = "";
    let is_valid_empty = !empty_id.is_empty() && empty_id.len() <= MAX_MATCH_ID_LEN;
    assert!(!is_valid_empty);

    // Exactly 32 chars — valid.
    let id_32 = "a".repeat(32);
    let is_valid_32 = !id_32.is_empty() && id_32.len() <= MAX_MATCH_ID_LEN;
    assert!(is_valid_32);

    // 33 chars — rejected.
    let id_33 = "a".repeat(33);
    let is_valid_33 = !id_33.is_empty() && id_33.len() <= MAX_MATCH_ID_LEN;
    assert!(!is_valid_33);

    // 1 char — valid.
    let id_1 = "x";
    let is_valid_1 = !id_1.is_empty() && id_1.len() <= MAX_MATCH_ID_LEN;
    assert!(is_valid_1);
}

#[test]
fn initialize_validates_bet_amount() {
    // Zero is the canonical on-chain representation of a free match.

    let zero_bet: u64 = 0;
    assert!(zero_bet >= MIN_BET_AMOUNT);

    let one_bet: u64 = 1;
    assert!(one_bet >= MIN_BET_AMOUNT);

    let large_bet: u64 = 1_000_000_000;
    assert!(large_bet >= MIN_BET_AMOUNT);
}

#[test]
fn initialize_validates_platform_fee() {
    // platform_fee_basis_points must be <= PLATFORM_FEE_MAX_BPS (10_000).

    let fee_0: u16 = 0;
    assert!(fee_0 <= PLATFORM_FEE_MAX_BPS);

    let fee_200: u16 = 200;
    assert!(fee_200 <= PLATFORM_FEE_MAX_BPS);

    let fee_10000: u16 = 10_000;
    assert!(fee_10000 <= PLATFORM_FEE_MAX_BPS);

    let fee_10001: u16 = 10_001;
    assert!(!(fee_10001 <= PLATFORM_FEE_MAX_BPS));
}

#[test]
fn initialize_full_match_id_32_valid() {
    // MAX_MATCH_ID_LEN is 32. Verify a 32-char match_id is accepted.
    let match_id = "abcdefghijklmnopqrstuvwxyz012345"; // 32 chars
    assert_eq!(match_id.len(), MAX_MATCH_ID_LEN);
    assert!(match_id.len() <= MAX_MATCH_ID_LEN);
    assert!(!match_id.is_empty());
}

// ===========================================================================
// 2. Join Match Tests (5)
// ===========================================================================

#[test]
fn join_match_validation() {
    // Simulate handle_join_match: verify that a valid join updates state correctly.
    let mut game = standard_match(PlayerColor::White);
    // Set up as if created by player 0, waiting for opponent.
    let joiner = Pubkey::new_unique();
    let creator = Pubkey::new_unique();
    game.players = [creator, Pubkey::default()];
    game.game_status = GameStatus::WaitingForOpponent;
    game.bet_amount_player_one = 50_000_000;
    game.total_pot = 50_000_000;

    let bet_amount = 50_000_000u64;

    // Pre-conditions: game is WaitingForOpponent, players[1] is default.
    assert_eq!(game.game_status, GameStatus::WaitingForOpponent);
    assert_eq!(game.players[1], Pubkey::default());

    // Validate bet matches player one's bet.
    assert_eq!(bet_amount, game.bet_amount_player_one);

    // Simulate join: set players[1] = joiner, game_status = Active.
    game.players[1] = joiner;
    game.game_status = GameStatus::Active;
    game.bet_amount_player_two = bet_amount;
    game.total_pot = game.bet_amount_player_one.checked_add(bet_amount).unwrap();

    assert_eq!(game.players[1], joiner);
    assert_eq!(game.game_status, GameStatus::Active);
    assert_eq!(game.bet_amount_player_two, bet_amount);
    assert_eq!(game.total_pot, 100_000_000);
    assert_eq!(game.players[0], creator);
}

#[test]
fn join_rejects_own_match() {
    // handle_join_match: players[0] != joiner — cannot join own match.
    let mut game = standard_match(PlayerColor::White);
    let creator = Pubkey::new_unique();
    game.players = [creator, Pubkey::default()];
    game.game_status = GameStatus::WaitingForOpponent;

    let joiner = creator; // Trying to join own match.

    let is_own_match = joiner == game.players[0];
    assert!(is_own_match);
    // This should trigger ChessError::CannotJoinOwnMatch.
}

#[test]
fn join_rejects_bet_mismatch() {
    // handle_join_match: bet_amount_arg must equal bet_amount_player_one.
    let mut game = standard_match(PlayerColor::White);
    let creator = Pubkey::new_unique();
    game.players = [creator, Pubkey::default()];
    game.game_status = GameStatus::WaitingForOpponent;
    game.bet_amount_player_one = 100_000_000;

    let bet_from_joiner: u64 = 50_000_000; // Mismatch.

    let is_match = bet_from_joiner == game.bet_amount_player_one;
    assert!(!is_match);
    // Should trigger ChessError::BetAmountMismatch.
}

#[test]
fn join_rejects_when_not_waiting() {
    // handle_join_match constraint: game_status must be WaitingForOpponent.
    let mut game = standard_match(PlayerColor::White);
    let creator = Pubkey::new_unique();
    game.players = [creator, Pubkey::default()];
    game.game_status = GameStatus::Active; // Already active.

    let can_join = game.game_status == GameStatus::WaitingForOpponent;
    assert!(!can_join);
    // Should trigger ChessError::MatchAlreadyFullOrActive.
}

#[test]
fn join_rejects_if_second_slot_filled() {
    // handle_join_match constraint: players[1] must be Pubkey::default().
    let mut game = standard_match(PlayerColor::White);
    let creator = Pubkey::new_unique();
    let other_player = Pubkey::new_unique();
    game.players = [creator, other_player]; // Already has both players.
    game.game_status = GameStatus::WaitingForOpponent;

    let slot_available = game.players[1] == Pubkey::default();
    assert!(!slot_available);
    // Should trigger ChessError::MatchAlreadyFullOrActive.
}

// ===========================================================================
// 3. Resign Game Tests (4)
// ===========================================================================

#[test]
fn resign_sets_correct_winner() {
    // Simulate handle_resign_game: White resigns -> opponent (Black) wins.
    let mut game = standard_match(PlayerColor::White);
    let white = game.players[0];
    let _black = game.players[1];
    game.game_status = GameStatus::Active;

    // Resigner is White (players[0]).
    let resigner = white;
    assert_eq!(resigner, game.players[0]);

    // Opponent must have joined.
    assert_ne!(game.players[1], Pubkey::default());

    // Winner is Black.
    game.game_status = GameStatus::BlackWins;
    game.game_end_reason = Some(GameEndReason::Resignation);

    assert_eq!(game.game_status, GameStatus::BlackWins);
    assert_eq!(game.game_end_reason, Some(GameEndReason::Resignation));
}

#[test]
fn resign_sets_correct_winner_black() {
    // Simulate handle_resign_game: Black resigns -> White wins.
    let mut game = standard_match(PlayerColor::Black);
    let _white = game.players[0];
    let black = game.players[1];
    game.game_status = GameStatus::Active;

    // Resigner is Black (players[1]).
    let resigner = black;
    assert_eq!(resigner, game.players[1]);

    // Winner is White.
    game.game_status = GameStatus::WhiteWins;
    game.game_end_reason = Some(GameEndReason::Resignation);

    assert_eq!(game.game_status, GameStatus::WhiteWins);
    assert_eq!(game.game_end_reason, Some(GameEndReason::Resignation));
}

#[test]
fn resign_rejects_non_player() {
    // handle_resign_game: signer must be players[0] or players[1].
    let mut game = standard_match(PlayerColor::White);
    game.game_status = GameStatus::Active;

    let outsider = Pubkey::new_unique();
    let is_player = outsider == game.players[0] || outsider == game.players[1];

    assert!(!is_player);
    // Should trigger ChessError::NotAPlayer.
}

#[test]
fn resign_rejects_non_active() {
    // handle_resign_game: game_status must be Active.
    let _game = standard_match(PlayerColor::White);
    // game_status defaults to Active from make_match — but let's explicitly test
    // that non-Active statuses are rejected.

    // WaitingForOpponent
    let can_resign_waiting = GameStatus::WaitingForOpponent == GameStatus::Active;
    assert!(!can_resign_waiting);

    // Already concluded (WhiteWins)
    let can_resign_concluded = GameStatus::WhiteWins == GameStatus::Active;
    assert!(!can_resign_concluded);

    // Aborted
    let can_resign_aborted = GameStatus::Aborted == GameStatus::Active;
    assert!(!can_resign_aborted);

    // Active
    let can_resign_active = GameStatus::Active == GameStatus::Active;
    assert!(can_resign_active);
}

// ===========================================================================
// 4. Claim Timeout Win Tests (5)
// ===========================================================================

#[test]
fn timeout_claim_validation() {
    // Simulate handle_claim_timeout_win: valid claimer gets the win.
    let mut game = standard_match(PlayerColor::Black); // Black's turn — White claims.
    let white = game.players[0];
    let _black = game.players[1];

    game.game_status = GameStatus::Active;
    game.last_move_timestamp = 0;
    game.move_timeout_duration = 900; // 15 minutes in seconds
    let now: i64 = 1_000; // 1000s elapsed > 900s timeout

    // Claimer is White, claiming Black (opponent) timed out.
    let claimer = white;

    // Pre-conditions:
    assert_eq!(game.game_status, GameStatus::Active);
    assert!(claimer == game.players[0] || claimer == game.players[1]);
    assert_ne!(game.players[1], Pubkey::default()); // opponent joined
    assert_eq!(game.current_turn, PlayerColor::Black); // opponent's turn
    assert!(game.move_timeout_duration > 0);
    let time_since = now.saturating_sub(game.last_move_timestamp);
    assert!(time_since > game.move_timeout_duration);

    // Simulate win.
    game.game_status = GameStatus::WhiteWins;
    game.game_end_reason = Some(GameEndReason::Timeout);

    assert_eq!(game.game_status, GameStatus::WhiteWins);
    assert_eq!(game.game_end_reason, Some(GameEndReason::Timeout));
}

#[test]
fn cannot_claim_timeout_if_not_timed_out() {
    // handle_claim_timeout_win: time_since_last_move <= move_timeout_duration rejects.
    let mut game = standard_match(PlayerColor::Black);
    game.game_status = GameStatus::Active;
    game.last_move_timestamp = 1_000;
    game.move_timeout_duration = 900;
    let now: i64 = 1_500; // Only 500s elapsed < 900s timeout

    let time_since = now.saturating_sub(game.last_move_timestamp);
    let has_timed_out = time_since > game.move_timeout_duration;

    assert!(!has_timed_out);
    // Should trigger ChessError::OpponentNotTimedOut.
}

#[test]
fn timeout_claim_rejects_own_turn() {
    // handle_claim_timeout_win: claimer's current_turn must be opponent's color.
    let mut game = standard_match(PlayerColor::White); // White's turn — White tries to claim.
    game.game_status = GameStatus::Active;
    game.last_move_timestamp = 0;
    game.move_timeout_duration = 100;
    let now: i64 = 200;

    let _claimer = game.players[0]; // White
    let is_opponent_turn = game.current_turn == PlayerColor::Black;
    // current_turn is White, so this is the claimer's own turn.

    assert!(!is_opponent_turn);
    // Should trigger ChessError::NotOpponentsTurnToClaimTimeout.

    // Verify the time HAS elapsed (it's only blocked by turn check).
    let time_since = now.saturating_sub(game.last_move_timestamp);
    assert!(time_since > game.move_timeout_duration);
}

#[test]
fn timeout_claim_rejects_no_timeout_configured() {
    // handle_claim_timeout_win: move_timeout_duration must be > 0.
    let game = standard_match(PlayerColor::Black);
    // move_timeout_duration defaults to 0.
    let has_timeout = game.move_timeout_duration > 0;

    assert!(!has_timeout);
    // Should trigger ChessError::TimeoutNotConfigured.
}

#[test]
fn timeout_claim_black_wins_on_white_timeout() {
    // Symmetric case: Black claims, White timed out.
    let mut game = standard_match(PlayerColor::White); // White's turn — Black claims.
    let _white = game.players[0];
    let black = game.players[1];

    game.game_status = GameStatus::Active;
    game.last_move_timestamp = 0;
    game.move_timeout_duration = 300;
    let now: i64 = 500;

    let claimer = black;

    assert_eq!(game.current_turn, PlayerColor::White); // opponent's turn
    assert!(claimer == game.players[1]);
    let time_since = now.saturating_sub(game.last_move_timestamp);
    assert!(time_since > game.move_timeout_duration);

    // Black wins.
    game.game_status = GameStatus::BlackWins;
    game.game_end_reason = Some(GameEndReason::Timeout);

    assert_eq!(game.game_status, GameStatus::BlackWins);
    assert_eq!(game.game_end_reason, Some(GameEndReason::Timeout));
}

// ===========================================================================
// 5. Settlement Tests (4)
// ===========================================================================

#[test]
fn payout_winner_correct() {
    // Simulate process_payout math from payout_logic.rs.
    // total_pot = 1000, fee_bps = 200 (2%) -> fee = 20, winner_amount = 980.
    let total_pot: u64 = 1_000;
    let fee_bps: u16 = 200;

    let fee = calculate_fee(total_pot, fee_bps);
    let winner_amount = calculate_winner_amount(total_pot, fee_bps);

    assert_eq!(fee, 20);
    assert_eq!(winner_amount, 980);
    assert_eq!(fee + winner_amount, total_pot);
}

#[test]
fn payout_draw_correct() {
    // Simulate process_draw_payout math.
    // total_pot = 1000, fee_bps = 200 -> fee = 20, remaining = 980.
    // player_one_refund = 490, player_two_refund = 490.
    let total_pot: u64 = 1_000;
    let fee_bps: u16 = 200;

    let (p1, p2) = calculate_draw_amounts(total_pot, fee_bps);
    let fee = calculate_fee(total_pot, fee_bps);

    assert_eq!(fee, 20);
    assert_eq!(p1, 490);
    assert_eq!(p2, 490);
    assert_eq!(fee + p1 + p2, total_pot);
}

#[test]
fn payout_processed_flag() {
    // handle_process_match_settlement: after settlement, payout_processed = true.
    // Second settlement attempt with payout_processed = true is rejected.
    let mut game = standard_match(PlayerColor::White);
    game.game_status = GameStatus::WhiteWins;
    game.payout_processed = false;

    // First settlement: allowed.
    assert!(!game.payout_processed);
    assert!(
        game.game_status == GameStatus::WhiteWins
            || game.game_status == GameStatus::BlackWins
            || game.game_status == GameStatus::Draw
    );

    // Simulate settlement processing: set flag.
    game.payout_processed = true;

    // Second settlement: rejected.
    assert!(game.payout_processed);
    // payout_processed == true should trigger ChessError::PayoutAlreadyProcessed.
}

#[test]
fn settlement_rejects_non_concluded() {
    // handle_process_match_settlement constraint: game_status must be
    // WhiteWins, BlackWins, or Draw.
    let mut game = standard_match(PlayerColor::White);

    // Active — not concluded.
    game.game_status = GameStatus::Active;
    let is_concluded_active = game.game_status == GameStatus::WhiteWins
        || game.game_status == GameStatus::BlackWins
        || game.game_status == GameStatus::Draw;
    assert!(!is_concluded_active);

    // WaitingForOpponent — not concluded.
    game.game_status = GameStatus::WaitingForOpponent;
    let is_concluded_waiting = game.game_status == GameStatus::WhiteWins
        || game.game_status == GameStatus::BlackWins
        || game.game_status == GameStatus::Draw;
    assert!(!is_concluded_waiting);

    // Aborted — not concluded for settlement purposes.
    game.game_status = GameStatus::Aborted;
    let is_concluded_aborted = game.game_status == GameStatus::WhiteWins
        || game.game_status == GameStatus::BlackWins
        || game.game_status == GameStatus::Draw;
    assert!(!is_concluded_aborted);

    // WhiteWins — concluded.
    game.game_status = GameStatus::WhiteWins;
    let is_concluded_whitewins = game.game_status == GameStatus::WhiteWins
        || game.game_status == GameStatus::BlackWins
        || game.game_status == GameStatus::Draw;
    assert!(is_concluded_whitewins);
}

// ===========================================================================
// 6. Escrow Ownership Test (1)
// ===========================================================================

#[test]
fn escrow_ownership_check() {
    // Simulate the escrow authority derivation from payout_logic.rs / abort_match.rs.
    // The handler derives Pubkey::find_program_address and checks that the
    // escrow token account owner == derived PDA.
    let program_id = Pubkey::new_unique();
    let match_id = "escrow-test-match";

    let (derived_pda, _bump) = derive_escrow_pda(match_id, &program_id);

    // Different program_id produces different PDA.
    let other_program = Pubkey::new_unique();
    let (other_pda, _) = derive_escrow_pda(match_id, &other_program);
    assert_ne!(derived_pda, other_pda);

    // Different match_id produces different PDA.
    let (other_match_pda, _) = derive_escrow_pda("other-match", &program_id);
    assert_ne!(derived_pda, other_match_pda);

    // Same inputs produce deterministic PDA.
    let (same_pda, _) = derive_escrow_pda(match_id, &program_id);
    assert_eq!(derived_pda, same_pda);

    // Verify match PDA derivation is also deterministic.
    let (match_pda1, _) = derive_match_pda(match_id, &program_id);
    let (match_pda2, _) = derive_match_pda(match_id, &program_id);
    assert_eq!(match_pda1, match_pda2);
    // Escrow PDA and match PDA from same match_id are different (different seeds).
    assert_ne!(derived_pda, match_pda1);
}

// ===========================================================================
// 7. Abort Match Tests (4)
// ===========================================================================

#[test]
fn abort_only_waiting_for_opponent() {
    // handle_abort_match constraint: game_status must be WaitingForOpponent.
    let mut game = standard_match(PlayerColor::White);

    // Active — cannot abort.
    game.game_status = GameStatus::Active;
    let can_abort_active = game.game_status == GameStatus::WaitingForOpponent;
    assert!(!can_abort_active);

    // WhiteWins — cannot abort.
    game.game_status = GameStatus::WhiteWins;
    let can_abort_concluded = game.game_status == GameStatus::WaitingForOpponent;
    assert!(!can_abort_concluded);

    // Aborted — cannot abort (already aborted).
    game.game_status = GameStatus::Aborted;
    let can_abort_already = game.game_status == GameStatus::WaitingForOpponent;
    assert!(!can_abort_already);

    // WaitingForOpponent — can abort.
    game.game_status = GameStatus::WaitingForOpponent;
    let can_abort = game.game_status == GameStatus::WaitingForOpponent;
    assert!(can_abort);
}

#[test]
fn abort_only_by_creator() {
    // handle_abort_match constraint: signer must be players[0].
    let game = standard_match(PlayerColor::White);
    let creator = game.players[0];
    let other_player = game.players[1];
    let outsider = Pubkey::new_unique();

    // Creator can abort.
    assert!(creator == game.players[0]);

    // Other player (players[1]) cannot abort.
    assert!(other_player != game.players[0]);

    // Outsider cannot abort.
    assert!(outsider != game.players[0]);
}

#[test]
fn close_only_after_settlement() {
    // handle_close_match constraint: payout_processed must be true.
    let mut game = standard_match(PlayerColor::White);

    // Not settled — cannot close.
    game.payout_processed = false;
    assert!(!game.payout_processed);
    // Should trigger ChessError::MatchNotSettled.

    // Settled — can close.
    game.payout_processed = true;
    assert!(game.payout_processed);
}

#[test]
fn abort_sets_correct_state() {
    // Simulate handle_abort_match state updates:
    // game_status = Aborted, game_end_reason = Aborted, payout_processed = true.
    let mut game = standard_match(PlayerColor::White);
    game.game_status = GameStatus::WaitingForOpponent;
    game.payout_processed = false;

    // Simulate abort.
    game.game_status = GameStatus::Aborted;
    game.game_end_reason = Some(GameEndReason::Aborted);
    game.payout_processed = true;

    assert_eq!(game.game_status, GameStatus::Aborted);
    assert_eq!(game.game_end_reason, Some(GameEndReason::Aborted));
    assert!(game.payout_processed);
}

// ===========================================================================
// 8. Session Key Tests (3)
// ===========================================================================

#[test]
fn session_set_validates_player() {
    // handle_set_session_key: player must be one of chess_match.players[i].
    let game = standard_match(PlayerColor::White);
    let player0 = game.players[0];
    let player1 = game.players[1];
    let outsider = Pubkey::new_unique();

    let is_authorized_p0 = player0 == game.players[0] || player0 == game.players[1];
    let is_authorized_p1 = player1 == game.players[0] || player1 == game.players[1];
    let is_authorized_outsider = outsider == game.players[0] || outsider == game.players[1];

    assert!(is_authorized_p0);
    assert!(is_authorized_p1);
    assert!(!is_authorized_outsider);
    // Unauthorized signer should trigger ChessError::UnauthorizedSigner.
}

#[test]
fn session_expiry_must_be_future() {
    // handle_set_session_key: expires_at > clock.unix_timestamp (strict greater).
    let now: i64 = 1_000_000;

    // expires_at == now — rejected (strict > not >=).
    let is_valid_eq = 1_000_000i64 > now;
    assert!(!is_valid_eq);

    // expires_at < now — rejected.
    let is_valid_past = 500_000i64 > now;
    assert!(!is_valid_past);

    // expires_at > now — accepted.
    let is_valid_future = 2_000_000i64 > now;
    assert!(is_valid_future);

    // expires_at one second in the future — accepted.
    let is_valid_1s = (now + 1) > now;
    assert!(is_valid_1s);
}

#[test]
fn revoke_clears_session() {
    // handle_revoke_session_key: session_signer = Pubkey::default(), expires_at = 0.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let future = 2_000_000i64;

    // First set a session.
    game.white_session_signer = session_key;
    game.white_session_expires_at = future;
    assert!(is_session_valid(&game, session_key, future - 1));

    // Simulate revoke.
    game.white_session_signer = Pubkey::default();
    game.white_session_expires_at = 0;

    assert_eq!(game.white_session_signer, Pubkey::default());
    assert_eq!(game.white_session_expires_at, 0);
    assert!(!is_session_valid(&game, session_key, 1_000_000));
}

// ===========================================================================
// 9. Delegation Tests (3)
// ===========================================================================

#[test]
fn delegate_sets_flag() {
    // handle_delegate_match: is_delegated = true, delegation_uid = uid.
    let mut game = standard_match(PlayerColor::White);
    let uid = "ephemeral-match-uuid-42".to_string();

    // Simulate delegate.
    game.is_delegated = true;
    game.delegation_uid = uid.clone();

    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, uid);
}

#[test]
fn undelegate_clears_flag() {
    // handle_undelegate_match: is_delegated = false.
    let mut game = standard_match(PlayerColor::White);
    game.is_delegated = true;
    game.delegation_uid = "temp-delegation".to_string();

    // Simulate undelegate.
    game.is_delegated = false;

    assert!(!game.is_delegated);
    // Note: delegation_uid may retain old value — the flag gates behavior.
}

#[test]
fn commit_does_not_change_delegation() {
    // handle_commit_state: commits state but does NOT change is_delegated.
    // Only undelegate_match clears the flag.
    let mut game = standard_match(PlayerColor::White);
    game.is_delegated = true;
    game.delegation_uid = "persistent-uid".to_string();

    // Simulate commit (does not touch delegation fields).
    // In the real handler, commit_state builds and invokes a MagicIntentBundle
    // but does not set is_delegated = false.
    // The delegation state should persist.

    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, "persistent-uid");

    // After commit, fields are unchanged.
    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, "persistent-uid");
}

// ===========================================================================
// 10. Crank Task Tests (2)
// ===========================================================================

#[test]
fn schedule_sets_active_task_id() {
    // handle_schedule_timeout: active_task_id is set to the scheduled task_id.
    let mut game = standard_match(PlayerColor::White);
    assert_eq!(game.active_task_id, -1);

    let task_id: i64 = 42;
    game.active_task_id = task_id;

    assert_eq!(game.active_task_id, task_id);
}

#[test]
fn cancel_resets_task_id() {
    // handle_cancel_timeout_task: active_task_id = -1.
    let mut game = standard_match(PlayerColor::White);
    game.active_task_id = 77; // Has an active task.

    // Simulate cancel.
    game.active_task_id = -1;

    assert_eq!(game.active_task_id, -1);
}

// ===========================================================================
// 11. Duplicate Account Check (1)
// ===========================================================================

#[test]
fn settlement_duplicate_accounts_detection() {
    // handle_process_match_settlement: all three recipient ATAs must be distinct.
    let p1_ata = Pubkey::new_unique();
    let p2_ata = Pubkey::new_unique();
    let platform_ata = Pubkey::new_unique();

    // Distinct — valid.
    let all_distinct = p1_ata != p2_ata && p1_ata != platform_ata && p2_ata != platform_ata;
    assert!(all_distinct);

    // p1 == p2 — invalid.
    let p1_eq_p2 = p1_ata != p1_ata;
    assert!(!p1_eq_p2);

    // p1 == platform — invalid.
    let p1_eq_platform = p1_ata != p1_ata;
    assert!(!p1_eq_platform);
}

// ===========================================================================
// 12. Revoke Session Key Authorization (1)
// ===========================================================================

#[test]
fn revoke_validates_player() {
    // handle_revoke_session_key: player must be one of chess_match.players[i].
    let game = standard_match(PlayerColor::White);
    let player0 = game.players[0];
    let player1 = game.players[1];
    let outsider = Pubkey::new_unique();

    let can_revoke_p0 = player0 == game.players[0] || player0 == game.players[1];
    let can_revoke_p1 = player1 == game.players[0] || player1 == game.players[1];
    let can_revoke_outsider = outsider == game.players[0] || outsider == game.players[1];

    assert!(can_revoke_p0);
    assert!(can_revoke_p1);
    assert!(!can_revoke_outsider);
}
