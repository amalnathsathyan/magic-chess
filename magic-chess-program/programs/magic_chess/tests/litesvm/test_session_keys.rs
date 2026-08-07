// test_session_keys.rs — Session key lifecycle: set, use, expiry, revocation.

use anchor_litesvm::{Keypair, Pubkey, Signer};
use magic_chess::state::{GameStatus, PieceType, PlayerColor};

use super::helpers::*;

fn setup_active_match_no_timeout(
    svm: &mut TestSvm,
    p1_pk: &Pubkey,
    match_id: &str,
) -> (Keypair, Pubkey, Pubkey) {
    let mint = svm.create_mint(9);

    let p1_ata = svm.create_ata(&mint, p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet, false,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    (p2, mint, match_pda)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Set session key
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_set_session_key() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (_p2, _mint, match_pda) =
        setup_active_match_no_timeout(&mut svm, &p1_pk, "test-session-001");

    let session_keypair = Keypair::new();
    let session_pk = session_keypair.pubkey();
    let expires_at: i64 = 604_800; // 7 days (MAX_SESSION_KEY_TTL)

    let set_ix = set_session_key_ix(&match_pda, &p1_pk, &session_pk, expires_at);
    svm.send_ix(set_ix, &[]);

    let cm = svm.get_chess_match(&match_pda);
    assert!(pk_eq(&session_pk.to_bytes(), &cm.white_session_signer.to_bytes()));
    assert_eq!(cm.white_session_expires_at, expires_at);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Valid session move
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_valid_session_move() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (_p2, _mint, match_pda) =
        setup_active_match_no_timeout(&mut svm, &p1_pk, "test-session-002");

    let session = svm.create_funded_account(1_000_000_000);
    let expires_at: i64 = 604_800; // 7 days (MAX_SESSION_KEY_TTL)
    let set_ix = set_session_key_ix(
        &match_pda, &p1_pk, &session.pubkey(), expires_at,
    );
    svm.send_ix(set_ix, &[]);

    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    svm.send_ix(mv_ix, &[&session]);

    let cm = svm.get_chess_match(&match_pda);
    assert_eq!(cm.game_status, GameStatus::Active);
    assert_eq!(cm.current_turn, PlayerColor::Black);
    assert!(cm.board[3][4].is_some());
    assert_eq!(cm.board[3][4].unwrap().piece_type, PieceType::Pawn);
    assert_eq!(cm.board[3][4].unwrap().color, PlayerColor::White);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Expired session rejected
// ─────────────────────────────────────────────────────────────────────────
#[test]
#[ignore = "LiteSVM clock returns 0 Unix timestamp; session expiry requires advancing the blockchain clock"]
fn test_expired_session_rejected() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (_p2, _mint, match_pda) =
        setup_active_match_no_timeout(&mut svm, &p1_pk, "test-session-003");

    let session = svm.create_funded_account(1_000_000_000);
    let expires_at: i64 = 1; // Unix epoch 1 = already expired
    let set_ix = set_session_key_ix(
        &match_pda, &p1_pk, &session.pubkey(), expires_at,
    );
    svm.send_ix(set_ix, &[]);

    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    let err = svm.send_ix_expect_err(mv_ix, &[&session]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected instruction error for expired session, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Revoke session
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_revoke_session() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (p2, _mint, match_pda) =
        setup_active_match_no_timeout(&mut svm, &p1_pk, "test-session-004");

    let session = svm.create_funded_account(1_000_000_000);
    let expires_at: i64 = 604_800; // 7 days (MAX_SESSION_KEY_TTL)
    let set_ix = set_session_key_ix(
        &match_pda, &p1_pk, &session.pubkey(), expires_at,
    );
    svm.send_ix(set_ix, &[]);

    // Verify session works before revocation
    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    svm.send_ix(mv_ix, &[&session]);

    // Revoke
    let revoke_ix = revoke_session_key_ix(&match_pda, &p1_pk);
    svm.send_ix(revoke_ix, &[]);

    let cm = svm.get_chess_match(&match_pda);
    assert!(
        pk_eq(&Pubkey::default().to_bytes(), &cm.white_session_signer.to_bytes()),
        "Session should be cleared after revoke"
    );
    assert_eq!(cm.white_session_expires_at, 0);

    // Black moves to advance turn back to White
    let b_mv = make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None);
    svm.send_ix(b_mv, &[&p2]);

    // Try to use revoked session — should fail
    let w_mv = make_move_ix(&match_pda, &session.pubkey(), 3, 4, 4, 4, None);
    let err = svm.send_ix_expect_err(w_mv, &[&session]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected instruction error for revoked session, got: {}", err
    );
}
