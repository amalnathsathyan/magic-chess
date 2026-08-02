// test_timeout.rs — Move-timeout detection and claim validation.
//
// NOTE: `claim_timeout_win` success requires CPI to the MagicBlock task
// scheduler (`Magic11111111111111111111111111111111111111`), which is not
// loaded in this test suite. The *validation* checks (steps 1-4) happen
// before the CPI and are testable. The *success* path is untestable here.
//
// `make_move` timeout detection (step 3) returns early before the CPI, so
// it works correctly without MagicBlock programs.

use magic_chess::state::{GameStatus, GameEndReason};
use solana_sdk::{signature::Keypair, signer::Signer};

use super::helpers::*;

/// Helper: create an active match with 1-second timeout.
/// Returns (p2, mint_pk, match_pda).
async fn setup_timed_match(
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

    // 1-second timeout
    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 1, 200, &platform_fee_wallet,
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
// 1. Timeout on make_move — verify game ends via timeout
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_timeout_on_make_move() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_timed_match(&mut ctx.banks_client, &p1, "test-timeout-001").await;

    // White makes a move
    let m1 = make_move_ix(&match_pda, &p1.pubkey(), 1, 4, 3, 4, None);
    send_tx(&mut ctx.banks_client, &p1, m1, &[]).await;

    // Warp to a future slot (~400ms per slot, 10 slots = ~4s > 1s timeout)
    ctx.warp_to_slot(100).unwrap();

    // Black tries to move — timeout detected, White wins (early return before CPI)
    let m2 = make_move_ix(&match_pda, &p2.pubkey(), 6, 4, 4, 4, None);
    send_tx(&mut ctx.banks_client, &p1, m2, &[&p2]).await;

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.game_status, GameStatus::WhiteWins);
    assert!(matches!(cm.game_end_reason, Some(GameEndReason::Timeout)));
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Cannot claim timeout if opponent hasn't timed out
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_cannot_claim_timeout_if_not_timed_out() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let (p2, _mint_pk, match_pda) =
        setup_timed_match(&mut ctx.banks_client, &p1, "test-timeout-002").await;

    // White moves — timestamp resets
    let m1 = make_move_ix(&match_pda, &p1.pubkey(), 1, 4, 3, 4, None);
    send_tx(&mut ctx.banks_client, &p1, m1, &[]).await;

    // Immediately claim timeout — opponent hasn't timed out.
    // Validation fires before CPI, so we get the correct error.
    let claim_ix = claim_timeout_win_ix(&match_pda, &p1.pubkey());
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, claim_ix, &[]).await;
    assert!(
        err.contains("NotOpponentsTurnToClaimTimeout") || err.contains("0x178f")
            || err.contains("OpponentNotTimedOut") || err.contains("0x1791"),
        "Expected timeout-related error, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Timeout not configured — claim rejected
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_cannot_claim_timeout_when_not_configured() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    // Create a match WITHOUT timeout (move_timeout_duration = 0)
    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-timeout-003";
    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet, // timeout = 0
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    // Join
    let p2 = Keypair::new();
    fund_keypair(&mut ctx.banks_client, &p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(&mut ctx.banks_client, &p1, join_ix, &[&p2]).await;

    // Try to claim timeout — should fail because timeout isn't configured
    let claim_ix = claim_timeout_win_ix(&match_pda, &p1.pubkey());
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, claim_ix, &[]).await;
    assert!(
        err.contains("TimeoutNotConfigured") || err.contains("0x1790"),
        "Expected TimeoutNotConfigured, got: {}", err
    );
}
