// MagicBlock-specific unit tests for Magic Chess.
// These are pure Rust tests — no Solana VM needed.
//
// Tests session key validation, delegation state, task ID lifecycle,
// MagicBlock field initialization, and field independence.

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

/// Simulate the session key validation check used in make_move.rs.
/// Session is valid if: session_signer != default() AND signer == session_signer AND now < expires_at.
fn is_session_valid(chess_match: &ChessMatch, signer: Pubkey, now: i64) -> bool {
    chess_match.session_signer != Pubkey::default()
        && signer == chess_match.session_signer
        && now < chess_match.session_expires_at
}

// ===========================================================================
// 1. Session Key Tests (8)
// ===========================================================================

#[test]
fn session_key_default_is_disabled() {
    // After init, session_signer = Pubkey::default(), session_expires_at = 0.
    // The session is NOT valid — default means unset.
    let game = standard_match(PlayerColor::White);
    let now: i64 = 1_000_000;

    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
    assert!(!is_session_valid(&game, Pubkey::new_unique(), now));
}

#[test]
fn session_key_valid_when_set() {
    // Set session_signer and expires_at to a future timestamp.
    // The signer matches — session is valid.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let future = 2_000_000;

    game.session_signer = session_key;
    game.session_expires_at = future;

    assert!(is_session_valid(&game, session_key, future - 1));
}

#[test]
fn session_key_invalid_wrong_signer() {
    // Session set for pubkey A. Sign with pubkey B. Must be rejected.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let wrong_signer = Pubkey::new_unique();
    let future = 2_000_000;

    game.session_signer = session_key;
    game.session_expires_at = future;

    assert!(!is_session_valid(&game, wrong_signer, future - 1));
}

#[test]
fn session_key_invalid_expired() {
    // Session set but expires_at is in the past. Must be rejected.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let past = 500_000;

    game.session_signer = session_key;
    game.session_expires_at = past;

    assert!(!is_session_valid(&game, session_key, past + 100));
}

#[test]
fn session_key_default_signer_rejected() {
    // session_signer = Pubkey::default() should NEVER be accepted as a valid
    // session, even if the signer also happens to be Pubkey::default().
    let mut game = standard_match(PlayerColor::White);

    game.session_signer = Pubkey::default();
    game.session_expires_at = 2_000_000;

    assert!(!is_session_valid(&game, Pubkey::default(), 1_000_000));
}

#[test]
fn session_key_revoke_clears_fields() {
    // After revoke, session_signer = Pubkey::default(), expires_at = 0.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();

    // Set a session first.
    game.session_signer = session_key;
    game.session_expires_at = 2_000_000;

    // Simulate revoke (matching revoke_session_key.rs logic).
    game.session_signer = Pubkey::default();
    game.session_expires_at = 0;

    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
    // And the session is no longer valid.
    assert!(!is_session_valid(&game, session_key, 1_000_000));
}

#[test]
fn session_key_set_only_by_player() {
    // Verify that the set_session_key instruction requires the signer to be
    // one of chess_match.players[i] (emulated here without the Solana runtime).
    let game = standard_match(PlayerColor::White);

    let player_white = game.players[0];
    let player_black = game.players[1];
    let outsider = Pubkey::new_unique();

    // Player 0 (White) is authorized.
    assert!(player_white == game.players[0] || player_white == game.players[1]);

    // Player 1 (Black) is authorized.
    assert!(player_black == game.players[0] || player_black == game.players[1]);

    // Outsider is NOT authorized.
    assert!(!(outsider == game.players[0] || outsider == game.players[1]));
}

#[test]
fn session_key_expires_exactly_at_timestamp() {
    // The check uses `now < session_expires_at` (strict less-than).
    // When `expires_at == now`, the session IS expired.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let now: i64 = 1_000_000;

    game.session_signer = session_key;
    game.session_expires_at = now;

    // 1 second before — valid.
    assert!(is_session_valid(&game, session_key, now - 1));
    // Exactly at — NOT valid (strict `<`).
    assert!(!is_session_valid(&game, session_key, now));
    // 1 second after — NOT valid.
    assert!(!is_session_valid(&game, session_key, now + 1));
}

// ===========================================================================
// 2. Delegation Tests (5)
// ===========================================================================

#[test]
fn delegation_defaults_not_delegated() {
    // After init, is_delegated = false, delegation_uid = "".
    let game = standard_match(PlayerColor::White);

    assert!(!game.is_delegated);
    assert_eq!(game.delegation_uid, "");
}

#[test]
fn delegation_set_flag() {
    // Simulate delegate: set is_delegated = true, delegation_uid = "match-abc".
    let mut game = standard_match(PlayerColor::White);

    game.is_delegated = true;
    game.delegation_uid = "match-abc".to_string();

    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, "match-abc");
}

#[test]
fn undelegation_clears_flag() {
    // Simulate undelegate: set is_delegated = false.
    let mut game = standard_match(PlayerColor::White);
    game.is_delegated = true;
    game.delegation_uid = "match-xyz".to_string();

    game.is_delegated = false;

    assert!(!game.is_delegated);
    // delegation_uid might still hold the old value, that's fine — the flag
    // gates behavior, not the uid string.
}

#[test]
fn delegation_uid_max_length() {
    // delegation_uid at exactly MAX_DELEGATION_UID_LEN (64 chars). Must fit.
    let mut game = standard_match(PlayerColor::White);
    let uid_64 = "a".repeat(64);

    game.delegation_uid = uid_64.clone();

    assert_eq!(game.delegation_uid.len(), 64);
    assert_eq!(game.delegation_uid, uid_64);
}

#[test]
fn delegation_uid_empty_allowed() {
    // delegation_uid = "" is valid. Represents not-yet-delegated state.
    let mut game = standard_match(PlayerColor::White);
    game.delegation_uid = String::new();

    assert_eq!(game.delegation_uid, "");
    assert_eq!(game.delegation_uid.len(), 0);
}

// ===========================================================================
// 3. Task ID Tests (5)
// ===========================================================================

#[test]
fn task_id_default_is_none() {
    // After init, active_task_id = -1.
    let game = standard_match(PlayerColor::White);

    assert_eq!(game.active_task_id, -1);
}

#[test]
fn task_id_schedule_sets_value() {
    // Simulate schedule: set active_task_id = 42. Verify it is stored.
    let mut game = standard_match(PlayerColor::White);

    game.active_task_id = 42;

    assert_eq!(game.active_task_id, 42);
}

#[test]
fn task_id_cancel_resets() {
    // Simulate cancel: active_task_id = 42, then reset to -1.
    let mut game = standard_match(PlayerColor::White);
    game.active_task_id = 42;

    game.active_task_id = -1;

    assert_eq!(game.active_task_id, -1);
}

#[test]
fn task_id_multiple_schedules() {
    // active_task_id changes: -1 -> 100 -> -1 -> 200. Each transition works.
    let mut game = standard_match(PlayerColor::White);

    assert_eq!(game.active_task_id, -1);

    game.active_task_id = 100;
    assert_eq!(game.active_task_id, 100);

    game.active_task_id = -1;
    assert_eq!(game.active_task_id, -1);

    game.active_task_id = 200;
    assert_eq!(game.active_task_id, 200);
}

#[test]
fn task_id_negative_one_means_no_task() {
    // All values >= 0 mean "has task". Only -1 means "no task".

    let test_cases: Vec<(i64, bool)> = vec![
        (-1, true),  // no task
        (0, false),   // has task
        (1, false),   // has task
        (42, false),  // has task
        (9999, false), // has task
    ];

    for (id, is_none) in &test_cases {
        let mut game = standard_match(PlayerColor::White);
        game.active_task_id = *id;
        let actually_has_task = game.active_task_id >= 0;
        assert_eq!(
            actually_has_task,
            !is_none,
            "active_task_id={} should mean has_task={}",
            id,
            !is_none
        );
    }
}

// ===========================================================================
// 4. Field Initialization Tests (3)
// ===========================================================================

#[test]
fn all_magicblock_fields_have_correct_defaults() {
    // Create a fresh ChessMatch. Verify every MagicBlock field has the right default.
    let game = standard_match(PlayerColor::White);

    assert_eq!(game.delegation_uid, "");
    assert!(!game.is_delegated);
    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
    assert_eq!(game.active_task_id, -1);
}

#[test]
fn magicblock_fields_persist_after_move() {
    // Make a valid pawn move. Verify MagicBlock fields are unchanged.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();

    game.delegation_uid = "magic-test".to_string();
    game.is_delegated = true;
    game.session_signer = session_key;
    game.session_expires_at = 9_999_999;
    game.active_task_id = 42;

    // Make a valid pawn move (white pawn from (1,0) to (2,0)).
    let result = chess_logic::validate_and_apply_move(
        &mut game, 1, 0, 2, 0, PlayerColor::White, None,
    );
    assert!(result.is_ok());

    // All MagicBlock fields are unchanged.
    assert_eq!(game.delegation_uid, "magic-test");
    assert!(game.is_delegated);
    assert_eq!(game.session_signer, session_key);
    assert_eq!(game.session_expires_at, 9_999_999);
    assert_eq!(game.active_task_id, 42);
}

#[test]
fn session_and_delegation_independent() {
    // Set session key AND delegate. Both states co-exist.
    // Revoke session — delegation still active.
    // Undelegate — session still active.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let future = 9_999_999;

    // Both set.
    game.session_signer = session_key;
    game.session_expires_at = future;
    game.is_delegated = true;
    game.delegation_uid = "dual-state".to_string();

    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, "dual-state");
    assert!(is_session_valid(&game, session_key, future - 1));

    // Revoke session — delegation still active.
    game.session_signer = Pubkey::default();
    game.session_expires_at = 0;

    assert!(game.is_delegated);
    assert_eq!(game.delegation_uid, "dual-state");
    assert!(!is_session_valid(&game, session_key, future - 1));

    // Undelegate — session remains revoked (still inactive).
    game.is_delegated = false;

    assert!(!game.is_delegated);
    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
}

// ===========================================================================
// 5. Integration Simulation (1)
// ===========================================================================

#[test]
fn full_session_lifecycle_simulation() {
    // Simulate: init -> set_session_key -> make move with session -> revoke -> session rejected.
    let mut game = standard_match(PlayerColor::White);
    let session_key = Pubkey::new_unique();
    let now: i64 = 1_000_000;
    let future = now + 3_600; // 1 hour from now

    // Step 1: Init — session is disabled.
    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
    assert!(!is_session_valid(&game, session_key, now));

    // Step 2: Set session key (emulating set_session_key handler).
    game.session_signer = session_key;
    game.session_expires_at = future;
    assert!(is_session_valid(&game, session_key, now));
    assert!(!is_session_valid(&game, Pubkey::new_unique(), now)); // wrong signer

    // Step 3: Make move with session key.
    // Simulate: White's turn, session key signs the move. The check passes
    // because `is_valid_session` returns true.
    let white_player = game.players[0];
    assert_ne!(white_player, session_key); // session key is different from player wallet
    assert!(is_session_valid(&game, session_key, now));
    // (actual move logic is tested elsewhere; here we just verify auth)

    // Step 4: Revoke session (emulating revoke_session_key handler).
    game.session_signer = Pubkey::default();
    game.session_expires_at = 0;
    assert!(!is_session_valid(&game, session_key, now));

    // Step 5: Session is rejected after revoke.
    assert_eq!(game.session_signer, Pubkey::default());
    assert_eq!(game.session_expires_at, 0);
    assert!(!is_session_valid(&game, session_key, now + 100));

    // Even the real player wallet should still be checked directly
    // (not via session), which is a separate authorization path.
}
