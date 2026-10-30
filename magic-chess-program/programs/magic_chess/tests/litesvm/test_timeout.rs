// test_timeout.rs — Move-timeout detection and claim validation.

use anchor_litesvm::{Keypair, Pubkey, Signer};
use magic_chess::state::GameStatus;

use super::helpers::*;

fn setup_timed_match(
    svm: &mut TestSvm,
    p1_pk: &Pubkey,
    match_id: &str,
    timeout_secs: i64,
) -> (Keypair, Pubkey, Pubkey) {
    let mint = svm.create_mint(9);

    let p1_ata = svm.create_ata(&mint, p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = platform_fee_wallet();

    let init_ix = initialize_match_ix(
        &match_pda, p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, timeout_secs, 200, &platform_fee_wallet, false,
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
// 1. Timeout configured — match works normally
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_timeout_move_works_with_timeout_configured() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (p2, _mint, match_pda) =
        setup_timed_match(&mut svm, &p1_pk, "test-timeout-001", 30);

    svm.send_ix(make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None), &[]);
    svm.send_ix(make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None), &[&p2]);

    let cm = svm.get_chess_match(&match_pda);
    assert_eq!(cm.game_status, GameStatus::Active);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Cannot claim timeout if not timed out
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_cannot_claim_timeout_if_not_timed_out() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let (_p2, _mint, match_pda) =
        setup_timed_match(&mut svm, &p1_pk, "test-timeout-002", 30);

    svm.send_ix(make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None), &[]);

    let claim_ix = claim_timeout_win_ix(&match_pda, &p1_pk);
    let err = svm.send_ix_expect_err(claim_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected timeout error, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. The move clock is mandatory: 0 ("no clock") is rejected at init, as
//    are values under 30 seconds or over 7 days. Without a clock an opponent
//    who leaves would lock the stake forever.
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_move_clock_bounds_enforced() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 10_000_000);
    let platform_fee_wallet = platform_fee_wallet();

    for (index, clock) in [0i64, 29, 7 * 24 * 60 * 60 + 1].into_iter().enumerate() {
        let match_id = format!("test-clock-bad-{index}");
        let (match_pda, _) = find_chess_match_pda(&match_id);
        let (escrow_pda, _) = find_escrow_pda(&match_id);
        let init_ix = initialize_match_ix(
            &match_pda, &p1_pk, &mint,
            &p1_ata, &escrow_pda, &match_id,
            100_000, clock, 200, &platform_fee_wallet, false,
        );
        let err = svm.send_ix_expect_err(init_ix, &[]);
        assert!(!err.is_empty(), "a move clock of {clock}s must be rejected");
        assert!(!svm.account_exists(&match_pda));
    }

    for (index, clock) in [30i64, 60, 7 * 24 * 60 * 60].into_iter().enumerate() {
        let match_id = format!("test-clock-ok-{index}");
        let (match_pda, _) = find_chess_match_pda(&match_id);
        let (escrow_pda, _) = find_escrow_pda(&match_id);
        let init_ix = initialize_match_ix(
            &match_pda, &p1_pk, &mint,
            &p1_ata, &escrow_pda, &match_id,
            100_000, clock, 200, &platform_fee_wallet, false,
        );
        svm.send_ix(init_ix, &[]);
        assert_eq!(svm.get_chess_match(&match_pda).move_timeout_duration, clock);
    }
}
