// test_session_keys.rs — Session key lifecycle: set, use, expiry, revocation.

use magic_chess::state::{GameStatus, PieceType, PlayerColor};
use solana_sdk::{signature::Keypair, signer::Signer};

use super::helpers::*;

/// Helper: create an active match with no timeout.
/// Returns (p2, mint_pk, match_pda).
async fn setup_active_match_no_timeout(
    banks_client: &mut solana_program_test::BanksClient,
    p1: &Keypair,
    match_id: &str,
) -> (
    Keypair,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
) {
    let mint = Keypair::new();
    create_mint(banks_client, p1, &mint, 9).await;

    let p1_ata = create_ata(banks_client, p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(banks_client, p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(banks_client, p1, init_ix, &[]).await;

    let p2 = Keypair::new();
    fund_keypair(banks_client, p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(banks_client, p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(banks_client, p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(banks_client, p1, join_ix, &[&p2]).await;

    (p2, mint.pubkey(), match_pda)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Set session key — verify stored in ChessMatch
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_set_session_key() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_active_match_no_timeout(&mut ctx.banks_client, &p1, "test-session-001").await;

    let session_keypair = Keypair::new();
    let session_pk = session_keypair.pubkey();
    let expires_at: i64 = 2_000_000_000;

    let set_ix = set_session_key_ix(&match_pda, &p1.pubkey(), &session_pk, expires_at);
    send_tx(&mut ctx.banks_client, &p1, set_ix, &[]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.session_signer, session_pk);
    assert_eq!(cm.session_expires_at, expires_at);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Valid session move — move accepted when signed by session key
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_valid_session_move() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_active_match_no_timeout(&mut ctx.banks_client, &p1, "test-session-002").await;

    // Set a session key for White (p1)
    let session = Keypair::new();
    let expires_at: i64 = 2_000_000_000;
    let set_ix = set_session_key_ix(
        &match_pda, &p1.pubkey(), &session.pubkey(), expires_at,
    );
    send_tx(&mut ctx.banks_client, &p1, set_ix, &[]).await;

    // Fund the session key with lamports
    fund_keypair(&mut ctx.banks_client, &p1, &session, 1_000_000_000).await;

    // Make a move using the session key (not the actual player)
    // The session key signs the instruction; p1 pays for fees.
    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    send_tx(&mut ctx.banks_client, &p1, mv_ix, &[&session]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::Active);
    assert_eq!(cm.current_turn, PlayerColor::Black);
    assert!(cm.board[3][4].is_some());
    assert_eq!(cm.board[3][4].unwrap().piece_type, PieceType::Pawn);
    assert_eq!(cm.board[3][4].unwrap().color, PlayerColor::White);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Expired session rejected
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_expired_session_rejected() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_active_match_no_timeout(&mut ctx.banks_client, &p1, "test-session-003").await;

    // Set a session key that expires at UNIX epoch 1 (already expired)
    let session = Keypair::new();
    let expires_at: i64 = 1;
    let set_ix = set_session_key_ix(
        &match_pda, &p1.pubkey(), &session.pubkey(), expires_at,
    );
    send_tx(&mut ctx.banks_client, &p1, set_ix, &[]).await;

    fund_keypair(&mut ctx.banks_client, &p1, &session, 1_000_000_000).await;

    // Try to move with expired session — should be rejected
    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    let err = send_tx_expect_err(
        &mut ctx.banks_client, &p1, mv_ix, &[&session],
    ).await;
    assert!(
        err.contains("UnauthorizedSigner") || err.contains("0x1794")
            || err.contains("InvalidSession") || err.contains("0x1795"),
        "Expected UnauthorizedSigner for expired session, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Revoke session — move rejected after revocation
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_revoke_session() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_active_match_no_timeout(&mut ctx.banks_client, &p1, "test-session-004").await;

    // Set a session key
    let session = Keypair::new();
    let expires_at: i64 = 2_000_000_000;
    let set_ix = set_session_key_ix(
        &match_pda, &p1.pubkey(), &session.pubkey(), expires_at,
    );
    send_tx(&mut ctx.banks_client, &p1, set_ix, &[]).await;

    fund_keypair(&mut ctx.banks_client, &p1, &session, 1_000_000_000).await;

    // Verify session works before revocation
    let mv_ix = make_move_ix(&match_pda, &session.pubkey(), 1, 4, 3, 4, None);
    send_tx(&mut ctx.banks_client, &p1, mv_ix, &[&session]).await;

    // Now revoke the session
    let revoke_ix = revoke_session_key_ix(&match_pda, &p1.pubkey());
    send_tx(&mut ctx.banks_client, &p1, revoke_ix, &[]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(
        cm.session_signer,
        solana_sdk::pubkey::Pubkey::default(),
        "Session should be cleared after revoke"
    );
    assert_eq!(cm.session_expires_at, 0);

    // Black moves to advance the turn back to White
    let b_mv = make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None);
    send_tx(&mut ctx.banks_client, &p1, b_mv, &[&p2]).await;

    // Now White's turn again — try to use the revoked session, should fail
    let w_mv = make_move_ix(&match_pda, &session.pubkey(), 3, 4, 4, 4, None);
    let err = send_tx_expect_err(
        &mut ctx.banks_client, &p1, w_mv, &[&session],
    ).await;
    assert!(
        err.contains("UnauthorizedSigner") || err.contains("0x1794"),
        "Expected UnauthorizedSigner for revoked session, got: {}", err
    );
}
