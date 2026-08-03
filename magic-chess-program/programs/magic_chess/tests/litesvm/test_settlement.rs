// test_settlement.rs — Payout logic: winner, draw, fee calculation, duplicate rejection.

use anchor_lang::{AccountDeserialize, AnchorSerialize};
use anchor_litesvm::{Keypair, Pubkey, Signer};
use magic_chess::state::{GameStatus, GameEndReason, ChessMatch};
use sha2::{Digest, Sha256};

use super::helpers::*;

/// Helper: create a joined match, return relevant keys.
fn setup_joined_match(
    svm: &mut TestSvm,
    p1_pk: &Pubkey,
    match_id: &str,
    platform_fee_wallet: &Keypair,
) -> (Keypair, Pubkey, Pubkey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let mint = svm.create_mint(9);

    let p1_ata = svm.create_ata(&mint, p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);

    let init_ix = initialize_match_ix(
        &match_pda, p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet.pubkey(), false,
    );
    svm.send_ix(init_ix, &[]);

    // Player 2
    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    // Platform fee token account
    let platform_ata = svm.create_ata(&mint, &platform_fee_wallet.pubkey());

    (p2, mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Winner payout
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_winner_payout() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();

    let (p2, _mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut svm, &p1_pk, "test-settle-001", &platform_fee_wallet);

    // Black (P2) resigns
    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    svm.send_ix(resign_ix, &[&p2]);

    let p1_before = svm.get_token_balance(&p1_ata);
    let p2_before = svm.get_token_balance(&p2_ata);
    let plat_before = svm.get_token_balance(&platform_ata);

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    svm.send_ix(settle_ix, &[]);

    let p1_after = svm.get_token_balance(&p1_ata);
    let p2_after = svm.get_token_balance(&p2_ata);
    let plat_after = svm.get_token_balance(&platform_ata);

    let total_pot: u64 = 200_000;
    let fee: u64 = total_pot * 200 / 10000;
    let winner_amount: u64 = total_pot - fee;

    assert_eq!(p1_after, p1_before + winner_amount);
    assert_eq!(p2_after, p2_before);
    assert_eq!(plat_after, plat_before + fee);

    assert_eq!(svm.get_token_balance(&escrow_pda), 0);
    assert!(svm.get_chess_match(&match_pda).payout_processed);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Draw payout
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_draw_payout() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();

    let (_p2, _mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut svm, &p1_pk, "test-settle-002", &platform_fee_wallet);

    // Manually set the match to Draw by overwriting on-chain account data.
    {
        let mut acct = svm.ctx.svm.get_account(&match_pda)
            .expect("ChessMatch not found");

        let mut cm = ChessMatch::try_deserialize(&mut acct.data.as_slice())
            .expect("deserialize ChessMatch");
        cm.game_status = GameStatus::Draw;
        cm.game_end_reason = Some(GameEndReason::Stalemate);

        let mut new_data = Vec::new();
        let mut hasher = Sha256::new();
        hasher.update(b"account:ChessMatch");
        new_data.extend_from_slice(&hasher.finalize()[..8]);
        cm.serialize(&mut new_data).unwrap();

        acct.data = new_data;
        svm.ctx.svm.set_account(match_pda, acct).unwrap();
    }

    let p1_before = svm.get_token_balance(&p1_ata);
    let p2_before = svm.get_token_balance(&p2_ata);
    let plat_before = svm.get_token_balance(&platform_ata);

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    svm.send_ix(settle_ix, &[]);

    let p1_after = svm.get_token_balance(&p1_ata);
    let p2_after = svm.get_token_balance(&p2_ata);
    let plat_after = svm.get_token_balance(&platform_ata);

    let total_pot: u64 = 200_000;
    let fee: u64 = total_pot * 200 / 10000;
    let remaining = total_pot - fee;
    let half = remaining / 2;

    assert_eq!(p1_after, p1_before + half);
    assert_eq!(p2_after, p2_before + (remaining - half));
    assert_eq!(plat_after, plat_before + fee);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Platform fee calculation (500 bps = 5%)
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_platform_fee_calculation() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let match_id = "test-settle-003";
    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);

    let init_ix = initialize_match_ix(
        &match_pda, &p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 500, &platform_fee_wallet.pubkey(), false,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    svm.send_ix(resign_ix, &[&p2]);

    let platform_ata = svm.create_ata(&mint, &platform_fee_wallet.pubkey());
    let plat_before = svm.get_token_balance(&platform_ata);

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    svm.send_ix(settle_ix, &[]);

    let plat_after = svm.get_token_balance(&platform_ata);
    let total_pot: u64 = 200_000;
    let expected_fee: u64 = total_pot * 500 / 10000;
    assert_eq!(plat_after - plat_before, expected_fee);

    let cm = svm.get_chess_match(&match_pda);
    assert_eq!(cm.platform_fee_basis_points, 500);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Duplicate settlement rejected
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_duplicate_settlement_rejected() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();

    let (p2, _mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut svm, &p1_pk, "test-settle-004", &platform_fee_wallet);

    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    svm.send_ix(resign_ix, &[&p2]);

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    svm.send_ix(settle_ix, &[]);

    // Second settlement should fail
    let settle_ix2 = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    let err = svm.send_ix_expect_err(settle_ix2, &[]);
    assert!(err.contains("PayoutAlreadyProcessed") || err.contains("0x1792") || err.contains("AlreadyProcessed"),
        "Expected PayoutAlreadyProcessed, got: {}", err);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Escrow fully drained
// ─────────────────────────────────────────────────────────────────────────
#[test]
fn test_escrow_fully_drained_after_settlement() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();

    let (p2, _mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata) =
        setup_joined_match(&mut svm, &p1_pk, "test-settle-005", &platform_fee_wallet);

    let resign_ix = resign_game_ix(&match_pda, &p2.pubkey());
    svm.send_ix(resign_ix, &[&p2]);

    let settle_ix = process_settlement_ix(
        &match_pda, &escrow_pda, &p1_ata, &p2_ata, &platform_ata,
    );
    svm.send_ix(settle_ix, &[]);

    assert_eq!(svm.get_token_balance(&escrow_pda), 0, "Escrow must be fully drained");
}
