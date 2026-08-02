// test_match_lifecycle.rs — Match creation, joining, aborting, and closing.

use magic_chess::state::{GameStatus, GameEndReason};
use solana_sdk::{signature::Keypair, signer::Signer};

use super::helpers::*;

// ─────────────────────────────────────────────────────────────────────────
// 1. Initialize match — verify account created, tokens escrowed
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_initialize_match() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;

    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-001";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, ix, &[]).await;

    // Verify ChessMatch account created
    let chess_match = get_chess_match(&mut ctx.banks_client, &chess_match_pda).await;
    assert_eq!(chess_match.match_id, match_id);
    assert_eq!(chess_match.game_status, GameStatus::WaitingForOpponent);
    assert_eq!(chess_match.players[0], p1.pubkey());
    assert_eq!(chess_match.bet_amount_player_one, bet_amount);
    assert_eq!(chess_match.total_pot, bet_amount);
    assert_eq!(chess_match.betting_token_mint, mint.pubkey());
    assert_eq!(chess_match.payout_processed, false);

    // Verify escrow holds the bet
    let escrow_balance = get_token_balance(&mut ctx.banks_client, &escrow_pda).await;
    assert_eq!(escrow_balance, bet_amount);

    // Verify player balance decreased
    let player_balance = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    assert_eq!(player_balance, 1_000_000 - bet_amount);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Join match — verify P2 joined, pot doubled
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_join_match() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;

    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-002";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Player 1 initializes
    let ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, ix, &[]).await;

    // Player 2 joins
    let p2 = Keypair::new();
    fund_keypair(&mut ctx.banks_client, &p1, &p2, 1_000_000_000).await;

    let p2_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    // Join: Player 2 signs (p2 is the extra signer); p1 pays fees
    let join_ix = join_match_ix(
        &chess_match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(&mut ctx.banks_client, &p1, join_ix, &[&p2]).await;

    // Verify match state
    let chess_match = get_chess_match(&mut ctx.banks_client, &chess_match_pda).await;
    assert_eq!(chess_match.game_status, GameStatus::Active);
    assert_eq!(chess_match.players[1], p2.pubkey());
    assert_eq!(chess_match.bet_amount_player_two, bet_amount);
    assert_eq!(chess_match.total_pot, bet_amount * 2);

    // Escrow doubled
    let escrow_balance = get_token_balance(&mut ctx.banks_client, &escrow_pda).await;
    assert_eq!(escrow_balance, bet_amount * 2);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Abort match — verify refund, escrow closed
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_abort_match() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-003";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Initialize only (no join)
    let ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, ix, &[]).await;

    let balance_before = get_token_balance(&mut ctx.banks_client, &p1_ata).await;

    // Abort
    let abort_ix = abort_match_ix(
        &chess_match_pda, &escrow_pda, &p1_ata, &p1.pubkey(),
    );
    send_tx(&mut ctx.banks_client, &p1, abort_ix, &[]).await;

    // Verify match state
    let chess_match = get_chess_match(&mut ctx.banks_client, &chess_match_pda).await;
    assert_eq!(chess_match.game_status, GameStatus::Aborted);
    assert!(matches!(chess_match.game_end_reason, Some(GameEndReason::Aborted)));
    assert_eq!(chess_match.payout_processed, true);

    // Verify refund received (balance restored)
    let balance_after = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    assert_eq!(balance_after, balance_before + bet_amount);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Cannot abort active match
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_cannot_abort_active_match() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-004";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    // Player 2 joins
    let p2 = Keypair::new();
    fund_keypair(&mut ctx.banks_client, &p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &chess_match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(&mut ctx.banks_client, &p1, join_ix, &[&p2]).await;

    // Try to abort active match
    let abort_ix = abort_match_ix(
        &chess_match_pda, &escrow_pda, &p1_ata, &p1.pubkey(),
    );
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, abort_ix, &[]).await;
    assert!(err.contains("MatchNotWaitingForOpponent") || err.contains("0x177b"),
        "Expected MatchNotWaitingForOpponent error, got: {}", err);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Close match after settlement
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_close_match_after_settlement() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-005";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    // Abort (sets payout_processed = true)
    let abort_ix = abort_match_ix(
        &chess_match_pda, &escrow_pda, &p1_ata, &p1.pubkey(),
    );
    send_tx(&mut ctx.banks_client, &p1, abort_ix, &[]).await;

    // Close match — should succeed after settlement/abort
    let close_ix = close_match_ix(&chess_match_pda, &p1.pubkey());
    send_tx(&mut ctx.banks_client, &p1, close_ix, &[]).await;

    // Verify PDA is closed (account data should be empty or gone)
    let result = ctx.banks_client.get_account(chess_match_pda).await.unwrap();
    assert!(result.is_none() || result.unwrap().data.is_empty(),
        "ChessMatch PDA should be closed after close_match");
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Cannot close unsettled match
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_cannot_close_unsettled_match() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;

    let p1 = clone_keypair(&ctx.payer);

    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-match-006";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Initialize but do NOT settle
    let init_ix = initialize_match_ix(
        &chess_match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet,
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    // Try to close — should fail (payout not processed)
    let close_ix = close_match_ix(&chess_match_pda, &p1.pubkey());
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, close_ix, &[]).await;
    assert!(err.contains("MatchNotSettled") || err.contains("0x1795"),
        "Expected MatchNotSettled error, got: {}", err);
}
