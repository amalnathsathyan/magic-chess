// test_match_lifecycle.rs — Match creation, joining, aborting, and closing.

use anchor_litesvm::{Keypair, Signer};
use magic_chess::state::{GameEndReason, GameStatus};

use super::helpers::*;

// ─────────────────────────────────────────────────────────────────────────
// 1. Initialize match — verify account created, tokens escrowed
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_initialize_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-001";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(ix, &[]);

    // Verify ChessMatch account created
    let chess_match = svm.get_chess_match(&chess_match_pda);
    assert_eq!(chess_match.match_id, match_id);
    assert_eq!(chess_match.game_status, GameStatus::WaitingForOpponent);
    assert!(pk_eq(&p1_pk.to_bytes(), &chess_match.players[0].to_bytes()));
    assert_eq!(chess_match.bet_amount_player_one, bet_amount);
    assert_eq!(chess_match.total_pot, bet_amount);
    assert!(pk_eq(
        &mint.to_bytes(),
        &chess_match.betting_token_mint.to_bytes()
    ));
    assert_eq!(chess_match.payout_processed, false);

    // Verify escrow holds the bet
    let escrow_balance = svm.get_token_balance(&escrow_pda);
    assert_eq!(escrow_balance, bet_amount);

    // Verify player balance decreased
    let player_balance = svm.get_token_balance(&p1_ata);
    assert_eq!(player_balance, 1_000_000 - bet_amount);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Join match — verify P2 joined, pot doubled
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_join_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-002";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Player 1 initializes
    let ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(ix, &[]);

    // Player 2 joins
    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &chess_match_pda,
        &p2.pubkey(),
        &p2_ata,
        &escrow_pda,
        bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    // Verify match state
    let chess_match = svm.get_chess_match(&chess_match_pda);
    assert_eq!(chess_match.game_status, GameStatus::Active);
    assert!(pk_eq(
        &p2.pubkey().to_bytes(),
        &chess_match.players[1].to_bytes()
    ));
    assert_eq!(chess_match.bet_amount_player_two, bet_amount);
    assert_eq!(chess_match.total_pot, bet_amount * 2);

    let escrow_balance = svm.get_token_balance(&escrow_pda);
    assert_eq!(escrow_balance, bet_amount * 2);
}

// ─────────────────────────────────────────────────────────────────────────
// 2b. Free match — zero wager is derived from on-chain state and no tokens move
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_free_match_lifecycle() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    let match_id = "test-free-match";
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        0,
        180,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    let join_ix = join_match_ix(&chess_match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, 0);
    svm.send_ix(join_ix, &[&p2]);

    let chess_match = svm.get_chess_match(&chess_match_pda);
    assert_eq!(chess_match.game_status, GameStatus::Active);
    assert_eq!(chess_match.bet_amount_player_one, 0);
    assert_eq!(chess_match.bet_amount_player_two, 0);
    assert_eq!(chess_match.total_pot, 0);
    assert_eq!(svm.get_token_balance(&escrow_pda), 0);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Abort match — verify refund, escrow closed
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_abort_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-003";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(ix, &[]);

    let balance_before = svm.get_token_balance(&p1_ata);

    // Abort
    let abort_ix = abort_match_ix(&chess_match_pda, &escrow_pda, &p1_ata, &p1_pk);
    svm.send_ix(abort_ix, &[]);

    let chess_match = svm.get_chess_match(&chess_match_pda);
    assert_eq!(chess_match.game_status, GameStatus::Aborted);
    assert!(matches!(
        chess_match.game_end_reason,
        Some(GameEndReason::Aborted)
    ));
    assert_eq!(chess_match.payout_processed, true);

    let balance_after = svm.get_token_balance(&p1_ata);
    assert_eq!(balance_after, balance_before + bet_amount);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Cannot abort active match
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_cannot_abort_active_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-004";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(init_ix, &[]);

    // Player 2 joins
    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &chess_match_pda,
        &p2.pubkey(),
        &p2_ata,
        &escrow_pda,
        bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    // Try to abort active match
    let abort_ix = abort_match_ix(&chess_match_pda, &escrow_pda, &p1_ata, &p1_pk);
    let err = svm.send_ix_expect_err(abort_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected instruction error, got: {}",
        err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Close match after settlement
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_close_match_after_settlement() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-005";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(init_ix, &[]);

    // Abort (sets payout_processed = true)
    let abort_ix = abort_match_ix(&chess_match_pda, &escrow_pda, &p1_ata, &p1_pk);
    svm.send_ix(abort_ix, &[]);

    // Close match
    let close_ix = close_match_ix(&chess_match_pda, &p1_pk);
    svm.send_ix(close_ix, &[]);

    // Verify PDA is closed
    let account = svm.ctx.svm.get_account(&chess_match_pda);
    assert!(
        account.is_none() || account.unwrap().data.is_empty(),
        "ChessMatch PDA should be closed after close_match"
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Cannot close unsettled match
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_cannot_close_unsettled_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-match-006";
    let bet_amount: u64 = 100_000;
    let (chess_match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    // Initialize but do NOT settle
    let init_ix = initialize_match_ix(
        &chess_match_pda,
        &p1_pk,
        &mint,
        &p1_ata,
        &escrow_pda,
        match_id,
        bet_amount,
        0,
        200,
        &platform_fee_wallet,
        false,
    );
    svm.send_ix(init_ix, &[]);

    let close_ix = close_match_ix(&chess_match_pda, &p1_pk);
    let err = svm.send_ix_expect_err(close_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected instruction error, got: {}",
        err
    );
}
