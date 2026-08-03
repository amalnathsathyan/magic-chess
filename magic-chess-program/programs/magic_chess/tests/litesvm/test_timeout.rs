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
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, timeout_secs, 200, &platform_fee_wallet,
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
        setup_timed_match(&mut svm, &p1_pk, "test-timeout-001", 1);

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
        setup_timed_match(&mut svm, &p1_pk, "test-timeout-002", 1);

    svm.send_ix(make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None), &[]);

    let claim_ix = claim_timeout_win_ix(&match_pda, &p1_pk);
    let err = svm.send_ix_expect_err(claim_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected timeout error, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Timeout not configured — claim rejected
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_cannot_claim_timeout_when_not_configured() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    // timeout_secs = 0 means no timeout configured
    let (_p2, _mint, match_pda) =
        setup_timed_match(&mut svm, &p1_pk, "test-timeout-003", 0);

    svm.send_ix(make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None), &[]);

    let claim_ix = claim_timeout_win_ix(&match_pda, &p1_pk);
    let err = svm.send_ix_expect_err(claim_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom"),
        "Expected TimeoutNotConfigured error, got: {}", err
    );
}
