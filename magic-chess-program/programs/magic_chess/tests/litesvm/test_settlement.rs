// test_settlement.rs — Payout logic: winner, draw, fee calculation, duplicate rejection.

use anchor_lang::AnchorSerialize;
use magic_chess::state::{GameStatus, GameEndReason, ChessMatch};
use sha2::{Digest, Sha256};
use solana_sdk::{signature::Keypair, signer::Signer};

use super::helpers::*;

/// Helper: create a joined match, return relevant keys.
/// Returns (p2, mint_pk, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata).
async fn setup_joined_match(
    banks_client: &mut solana_program_test::BanksClient,
    p1: &Keypair,
    match_id: &str,
    platform_fee_wallet: &Keypair,
) -> (
    Keypair,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
    solana_sdk::pubkey::Pubkey,
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

    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet.pubkey(),
    );
    send_tx(banks_client, p1, init_ix, &[]).await;

    // Player 2
    let p2 = Keypair::new();
    fund_keypair(banks_client, p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(banks_client, p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(banks_client, p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(banks_client, p1, join_ix, &[&p2]).await;

    // Platform fee ATA
    let platform_ata =
        create_ata(banks_client, p1, &mint.pubkey(), &platform_fee_wallet.pubkey()).await;

    (p2, mint.pubkey(), match_pda, escrow_pda, p1_ata, p2_ata, platform_ata)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Winner payout — verify token distribution
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_winner_payout() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let platform_fee_wallet = Keypair::new();
    let (p2, _mint_pk, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut ctx.banks_client, &p1, "test-settle-001", &platform_fee_wallet).await;

    // Black (P2) resigns → White (P1) wins
    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    send_tx(&mut ctx.banks_client, &p1, resign_ix, &[&p2]).await;

    let p1_before = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    let p2_before = get_token_balance(&mut ctx.banks_client, &p2_ata).await;
    let plat_before = get_token_balance(&mut ctx.banks_client, &platform_ata).await;

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    send_tx(&mut ctx.banks_client, &p1, settle_ix, &[]).await;

    let p1_after = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    let p2_after = get_token_balance(&mut ctx.banks_client, &p2_ata).await;
    let plat_after = get_token_balance(&mut ctx.banks_client, &platform_ata).await;

    let total_pot: u64 = 200_000;
    let fee: u64 = total_pot * 200 / 10000; // 2%
    let winner_amount: u64 = total_pot - fee;

    assert_eq!(p1_after, p1_before + winner_amount, "Winner should receive pot minus fee");
    assert_eq!(p2_after, p2_before, "Loser should receive nothing");
    assert_eq!(plat_after, plat_before + fee, "Platform should receive fee");

    // Escrow drained
    let escrow_balance = get_token_balance(&mut ctx.banks_client, &escrow_pda).await;
    assert_eq!(escrow_balance, 0);

    // payout_processed flag
    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert!(cm.payout_processed);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Draw payout — verify equal split minus fee
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_draw_payout() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let platform_fee_wallet = Keypair::new();
    let (p2, _mint_pk, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut ctx.banks_client, &p1, "test-settle-002", &platform_fee_wallet).await;

    // Manually set the match to Draw by overwriting on-chain account data.
    {
        let mut acct = ctx.banks_client
            .get_account(match_pda).await.unwrap()
            .expect("ChessMatch not found");

        let mut cm = ChessMatch::try_deserialize(&mut acct.data.as_slice())
            .expect("deserialize ChessMatch");
        cm.game_status = GameStatus::Draw;
        cm.game_end_reason = Some(GameEndReason::Stalemate);

        // Re-serialize with Anchor discriminator
        let mut new_data = Vec::new();
        let mut hasher = Sha256::new();
        hasher.update(b"account:ChessMatch");
        new_data.extend_from_slice(&hasher.finalize()[..8]);
        cm.serialize(&mut new_data).unwrap();

        acct.data = new_data;
        ctx.banks_client.set_account(match_pda, &acct).await.unwrap();
    }

    let p1_before = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    let p2_before = get_token_balance(&mut ctx.banks_client, &p2_ata).await;
    let plat_before = get_token_balance(&mut ctx.banks_client, &platform_ata).await;

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    send_tx(&mut ctx.banks_client, &p1, settle_ix, &[]).await;

    let p1_after = get_token_balance(&mut ctx.banks_client, &p1_ata).await;
    let p2_after = get_token_balance(&mut ctx.banks_client, &p2_ata).await;
    let plat_after = get_token_balance(&mut ctx.banks_client, &platform_ata).await;

    let total_pot: u64 = 200_000;
    let fee: u64 = total_pot * 200 / 10000;
    let remaining = total_pot - fee;
    let half = remaining / 2;

    assert_eq!(p1_after, p1_before + half);
    assert_eq!(p2_after, p2_before + (remaining - half));
    assert_eq!(plat_after, plat_before + fee);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Platform fee calculation — verify fee = pot * bps / 10000
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_platform_fee_calculation() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let platform_fee_wallet = Keypair::new();

    // Manually set up with 500 bps (5%) platform fee
    let mint = Keypair::new();
    create_mint(&mut ctx.banks_client, &p1, &mint, 9).await;
    let p1_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p1_ata, 1_000_000).await;

    let match_id = "test-settle-003";
    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);

    let init_ix = initialize_match_ix(
        &match_pda, &p1.pubkey(), &mint.pubkey(),
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 500, &platform_fee_wallet.pubkey(),
    );
    send_tx(&mut ctx.banks_client, &p1, init_ix, &[]).await;

    let p2 = Keypair::new();
    fund_keypair(&mut ctx.banks_client, &p1, &p2, 1_000_000_000).await;
    let p2_ata = create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2.pubkey()).await;
    mint_tokens(&mut ctx.banks_client, &p1, &mint.pubkey(), &p2_ata, 1_000_000).await;

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    send_tx(&mut ctx.banks_client, &p1, join_ix, &[&p2]).await;

    // P2 resigns -> White wins
    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    send_tx(&mut ctx.banks_client, &p1, resign_ix, &[&p2]).await;

    let platform_ata =
        create_ata(&mut ctx.banks_client, &p1, &mint.pubkey(), &platform_fee_wallet.pubkey()).await;
    let plat_before = get_token_balance(&mut ctx.banks_client, &platform_ata).await;

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    send_tx(&mut ctx.banks_client, &p1, settle_ix, &[]).await;

    let plat_after = get_token_balance(&mut ctx.banks_client, &platform_ata).await;
    let total_pot: u64 = 200_000;
    let expected_fee: u64 = total_pot * 500 / 10000; // 5% of 200k = 10,000
    assert_eq!(plat_after - plat_before, expected_fee, "Fee should be 5%");

    let cm = get_chess_match(&mut ctx.banks_client, &match_pda).await;
    assert_eq!(cm.platform_fee_basis_points, 500);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Duplicate settlement rejected
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_duplicate_settlement_rejected() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let platform_fee_wallet = Keypair::new();
    let (p2, _mint_pk, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut ctx.banks_client, &p1, "test-settle-004", &platform_fee_wallet).await;

    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    send_tx(&mut ctx.banks_client, &p1, resign_ix, &[&p2]).await;

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    send_tx(&mut ctx.banks_client, &p1, settle_ix, &[]).await;

    // Second settlement should fail
    let settle_ix2 = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    let err = send_tx_expect_err(&mut ctx.banks_client, &p1, settle_ix2, &[]).await;
    assert!(
        err.contains("PayoutAlreadyProcessed") || err.contains("0x1792"),
        "Expected PayoutAlreadyProcessed, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Escrow fully drained after settlement
// ─────────────────────────────────────────────────────────────────────────
#[tokio::test]
async fn test_escrow_fully_drained_after_settlement() {
    let pt = setup_program_test();
    let mut ctx = pt.start_with_context().await;
    let p1 = clone_keypair(&ctx.payer);

    let platform_fee_wallet = Keypair::new();
    let (p2, _mint_pk, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut ctx.banks_client, &p1, "test-settle-005", &platform_fee_wallet).await;

    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    send_tx(&mut ctx.banks_client, &p1, resign_ix, &[&p2]).await;

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    send_tx(&mut ctx.banks_client, &p1, settle_ix, &[]).await;

    let escrow_balance = get_token_balance(&mut ctx.banks_client, &escrow_pda).await;
    assert_eq!(escrow_balance, 0, "Escrow must be fully drained");
}
