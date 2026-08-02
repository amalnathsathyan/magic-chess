// test_gameplay.rs — Move validation, checkmate, stalemate, and resignation.

use magic_chess::state::{GameStatus, GameEndReason, PieceType, PlayerColor};
use solana_sdk::{signature::Keypair, signer::Signer};

use super::helpers::*;

/// Helper: Initialize + Join → active match.
/// Returns (p2_keypair, match_pda, escrow_pda).
async fn setup_active_match(
    banks_client: &mut solana_program_test::BanksClient,
    p1: &Keypair,
    match_id: &str,
) -> (Keypair, solana_sdk::pubkey::Pubkey, solana_sdk::pubkey::Pubkey) {
    let mint = Keypair::new();
    create_mint(banks_client, p1, &mint, 9).await;

    let p1_ata = create_ata(banks_client, p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(banks_client, p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(banks_client, p1, init_ix, &[]).await;

    // Player 2
    let p2 = Keypair::new();
    fund_keypair(banks_client, p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(banks_client, p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(banks_client, p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &chess_match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(banks_client, p1, join_ix, &[&p2]).await;

    (p2, chess_match_pda, escrow_pda)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Valid pawn move — e2 to e4
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_valid_pawn_move() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-001").await;

    // White (P1) moves pawn from e2 (row=1, col=4) to e4 (row=3, col=4)
    let mv_ix = make_move_ix(&match_pda, &p1.pubkey(), 1, 4, 3, 4, None);
    send_tx(&mut ctx.banks_client, &p1, mv_ix, &[]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::Active);
    assert_eq!(cm.current_turn, PlayerColor::Black);

    // Board: e4 should have White pawn
    let piece_at_e4 = cm.board[3][4];
    assert!(piece_at_e4.is_some());
    let piece = piece_at_e4.unwrap();
    assert_eq!(piece.piece_type, PieceType::Pawn);
    assert_eq!(piece.color, PlayerColor::White);

    // Board: e2 should be empty
    assert!(cm.board[1][4].is_none());
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Valid knight move — b1 to c3
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_valid_knight_move() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-002").await;

    // White knight from b1 (row=0, col=1) to c3 (row=2, col=2)
    let mv_ix = make_move_ix(&match_pda, &p1.pubkey(), 0, 1, 2, 2, None);
    send_tx(&mut ctx.banks_client, &p1, mv_ix, &[]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    // c3 should have White knight
    let piece = cm.board[2][2].expect("Knight should be at c3");
    assert_eq!(piece.piece_type, PieceType::Knight);
    assert_eq!(piece.color, PlayerColor::White);
    // b1 should be empty
    assert!(cm.board[0][1].is_none());
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Invalid move rejected — out of bounds
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_invalid_move_out_of_bounds() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-003").await;

    let mv_ix = make_move_ix(&match_pda, &p1.pubkey(), 1, 0, 8, 0, None);
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, mv_ix, &[]).await;
    assert!(err.contains("InvalidMoveOutOfBounds") || err.contains("0x1781"),
        "Expected InvalidMoveOutOfBounds, got: {}", err);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Wrong turn rejected
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_wrong_turn_rejected() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-004").await;

    // Black (P2) tries to move on White's turn. Signer = P2, payer = P1
    let mv_ix = make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None);
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, mv_ix, &[&p2]).await;
    assert!(
        err.contains("UnauthorizedSigner") || err.contains("0x1794")
            || err.contains("NotYourTurn") || err.contains("0x178d"),
        "Expected UnauthorizedSigner or NotYourTurn, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Checkmate — Fool's Mate (f3, e5, g4, Qh4#)
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_checkmate_fools_mate() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-005").await;

    // 1. White f2-f3 (row=1, col=5 -> row=2, col=5)
    let m1 = make_move_ix(&match_pda, &p1.pubkey(), 1, 5, 2, 5, None);
    send_tx(&mut ctx.banks_client, &p1, m1, &[]).await;

    // 2. Black e7-e5 (row=6, col=4 -> row=4, col=4)
    let m2 = make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None);
    send_tx(&mut ctx.banks_client, &p1, m2, &[&p2]).await;

    // 3. White g2-g4 (row=1, col=6 -> row=3, col=6)
    let m3 = make_move_ix(&match_pda, &p1.pubkey(), 1, 6, 3, 6, None);
    send_tx(&mut ctx.banks_client, &p1, m3, &[]).await;

    // 4. Black Qd8-h4# (row=7, col=3 -> row=3, col=7)
    let m4 = make_move_ix(&match_pda, &p2.pubkey(), 7, 3, 3, 7, None);
    send_tx(&mut ctx.banks_client, &p1, m4, &[&p2]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::BlackWins);
    assert!(matches!(cm.game_end_reason, Some(GameEndReason::Checkmate)));
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Stalemate — set up position, make move, verify stalemate detected
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_stalemate() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-006").await;

    // Play a fast stalemate sequence.
    // The moves: alternating White (p1) and Black (p2).
    let moves: &[(bool, u8, u8, u8, u8)] = &[
        (true,  1, 4, 3, 4),   // 1.  e4
        (false, 6, 0, 4, 0),   // 1.  a5
        (true,  0, 3, 3, 7),   // 2.  Qh5
        (false, 7, 0, 5, 0),   // 2.  Ra6
        (true,  3, 7, 4, 0),   // 3.  Qxa5
        (false, 6, 7, 4, 7),   // 3.  h5
        (true,  4, 0, 6, 2),   // 4.  Qxc7
        (false, 6, 5, 4, 5),   // 4.  f6 (f7-f5)
        (true,  6, 2, 5, 3),   // 5.  Qxd7+
        (false, 7, 5, 5, 5),   // 5.  Kf7
        (true,  5, 3, 6, 1),   // 6.  Qxb7
        (false, 0, 3, 2, 3),   // 6.  Qd3
        (true,  6, 1, 7, 1),   // 7.  Qxb8
        (false, 2, 3, 1, 7),   // 7.  Qh7
        (true,  7, 1, 7, 2),   // 8.  Qxc8
        (false, 5, 5, 4, 6),   // 8.  Kg6
        (true,  7, 2, 4, 4),   // 9.  Qe6 (stalemate)
    ];

    for &(is_white, from_r, from_c, to_r, to_c) in moves {
        let (player_pk, extra) = if is_white {
            (p1.pubkey(), vec![])
        } else {
            (p2.pubkey(), vec![&p2 as &Keypair])
        };
        let mv_ix = make_move_ix(&match_pda, &player_pk, from_r, from_c, to_r, to_c, None);
        send_tx(&mut ctx.banks_client, &p1, mv_ix, &extra).await;
    }

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::Draw);
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Resign game — verify game ends, opponent wins
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_resign_game() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, match_pda, _) =
        setup_active_match(&mut ctx.banks_client, &p1, "test-gameplay-007").await;

    // White resigns
    let resign_ix = resign_game_ix(&match_pda, &p1.pubkey());
    send_tx(&mut ctx.banks_client, &p1, resign_ix, &[]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::BlackWins);
    assert!(matches!(cm.game_end_reason, Some(GameEndReason::Resignation)));
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Game not active — cannot make moves
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_game_not_active_cannot_move() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-gameplay-008";
    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Only initialize (game is WaitingForOpponent, not Active)
    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    // Try to make a move
    let mv_ix = make_move_ix(&match_pda, &p1.pubkey(), 1, 4, 3, 4, None);
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, mv_ix, &[]).await;
    assert!(err.contains("GameNotActive") || err.contains("0x178c"),
        "Expected GameNotActive, got: {}", err);
}
