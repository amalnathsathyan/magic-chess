// test_prediction.rs — Prediction market: pool init, betting, settlement, claims, cancels.

use anchor_lang::{AccountDeserialize, AccountSerialize};
use anchor_litesvm::{Instruction, Keypair, Pubkey, Signer};
use magic_chess::state::{ChessMatch, GameStatus, GameEndReason, PredictionPool};

use super::helpers::*;

// ── Helper: create a match, enable prediction, join, start game ────────────
fn setup_match_for_prediction(
    svm: &mut TestSvm,
    p1_pk: &Pubkey,
    match_id: &str,
) -> (Keypair, Pubkey, Pubkey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let bet_amount: u64 = 100_000;
    let (match_pda, _) = find_chess_match_pda(match_id);
    let (escrow_pda, _) = find_escrow_pda(match_id);
    let platform_fee_wallet = Keypair::new();

    let init_ix = initialize_match_ix(
        &match_pda, p1_pk, &mint,
        &p1_ata, &escrow_pda, match_id,
        bet_amount, 0, 200, &platform_fee_wallet.pubkey(), true,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);

    let join_ix = join_match_ix(
        &match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, bet_amount,
    );
    svm.send_ix(join_ix, &[&p2]);

    // Make first move so game is Active
    let move_ix = make_move_ix(&match_pda, p1_pk, 1, 4, 3, 4, None);
    svm.send_ix(move_ix, &[]);

    let platform_ata = svm.create_ata(&mint, &platform_fee_wallet.pubkey());

    (p2, mint, match_pda, escrow_pda, p1_ata, p2_ata, platform_ata)
}

// ── Helper: set game status via direct mutation (for concluded games) ──────
fn set_game_status(svm: &mut TestSvm, match_pda: &Pubkey, status: GameStatus, reason: GameEndReason) {
    let mut acct = svm.ctx.svm.get_account(match_pda).expect("match not found");
    let mut cm = ChessMatch::try_deserialize(&mut acct.data.as_slice())
        .expect("deserialize ChessMatch");
    cm.game_status = status;
    cm.game_end_reason = Some(reason);
    let mut new_data = Vec::new();
    cm.try_serialize(&mut new_data).unwrap();
    acct.data = new_data;
    svm.ctx.svm.set_account(*match_pda, acct).unwrap();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Initialize prediction pool
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_prediction_pool() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-init-001");

    let (pool_pda, _) = find_prediction_pool_pda("pred-init-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 500,
    );
    svm.send_ix(ix, &[]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert_eq!(pool.match_id, "pred-init-001");
    assert_eq!(pool.platform_fee_bps, 500);
    assert_eq!(pool.total_bet_on_white, 0);
    assert_eq!(pool.total_bet_on_black, 0);
    assert_eq!(pool.total_bet_on_draw, 0);
    assert!(!pool.settlement_processed);
}

#[test]
fn test_cannot_init_pool_without_prediction_enabled() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let (match_pda, _) = find_chess_match_pda("pred-noenable");
    let (escrow_pda, _) = find_escrow_pda("pred-noenable");
    let platform_fee_wallet = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, &p1_pk, &mint,
        &p1_ata, &escrow_pda, "pred-noenable",
        100_000, 0, 200, &platform_fee_wallet, false,
    );
    svm.send_ix(init_ix, &[]);

    let (pool_pda, _) = find_prediction_pool_pda("pred-noenable");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 500,
    );
    let err = svm.send_ix_expect_err(ix, &[]);
    // Any error string is valid — send_ix_expect_err already verified failure
    assert!(!err.is_empty(), "Expected error but transaction succeeded");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Place prediction bets
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_place_bet_on_white() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-bet-001");

    let (pool_pda, _) = find_prediction_pool_pda("pred-bet-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let spectator = svm.create_funded_account(1_000_000_000);
    let spectator_ata = svm.create_ata(&mint, &spectator.pubkey());
    svm.mint_tokens(&mint, &spectator_ata, 1_000_000);

    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &spectator.pubkey());

    let bet_ix = place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &spectator_ata, &spectator.pubkey(),
        50_000, 0,
    );
    svm.send_ix(bet_ix, &[&spectator]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert_eq!(pool.total_bet_on_white, 50_000);
    assert_eq!(pool.total_bet_on_black, 0);
    assert_eq!(pool.total_bet_on_draw, 0);
}

#[test]
fn test_place_bet_on_black() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-bet-002");

    let (pool_pda, _) = find_prediction_pool_pda("pred-bet-002");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let spectator = svm.create_funded_account(1_000_000_000);
    let spectator_ata = svm.create_ata(&mint, &spectator.pubkey());
    svm.mint_tokens(&mint, &spectator_ata, 1_000_000);

    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &spectator.pubkey());

    let bet_ix = place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &spectator_ata, &spectator.pubkey(),
        30_000, 1,
    );
    svm.send_ix(bet_ix, &[&spectator]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert_eq!(pool.total_bet_on_white, 0);
    assert_eq!(pool.total_bet_on_black, 30_000);
    assert_eq!(pool.total_bet_on_draw, 0);
}

#[test]
fn test_place_bet_on_draw() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-bet-003");

    let (pool_pda, _) = find_prediction_pool_pda("pred-bet-003");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let spectator = svm.create_funded_account(1_000_000_000);
    let spectator_ata = svm.create_ata(&mint, &spectator.pubkey());
    svm.mint_tokens(&mint, &spectator_ata, 1_000_000);

    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &spectator.pubkey());

    let bet_ix = place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &spectator_ata, &spectator.pubkey(),
        20_000, 2,
    );
    svm.send_ix(bet_ix, &[&spectator]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert_eq!(pool.total_bet_on_white, 0);
    assert_eq!(pool.total_bet_on_black, 0);
    assert_eq!(pool.total_bet_on_draw, 20_000);
}

#[test]
fn test_player_cannot_bet_on_own_match() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-noplayer");

    let (pool_pda, _) = find_prediction_pool_pda("pred-noplayer");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 500_000);

    let bet_ix = place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &p1_ata, &p1_pk,
        50_000, 0,
    );
    let err = svm.send_ix_expect_err(bet_ix, &[]);
    assert!(err.contains("InstructionError") || err.contains("Custom"),
        "Expected PlayersCannotBet error, got: {}", err);
}

#[test]
fn test_invalid_outcome_rejected() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-badout");

    let (pool_pda, _) = find_prediction_pool_pda("pred-badout");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let spectator = svm.create_funded_account(1_000_000_000);
    let spectator_ata = svm.create_ata(&mint, &spectator.pubkey());
    svm.mint_tokens(&mint, &spectator_ata, 1_000_000);

    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &spectator.pubkey());

    let bet_ix = place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &spectator_ata, &spectator.pubkey(),
        10_000, 3,
    );
    let err = svm.send_ix_expect_err(bet_ix, &[&spectator]);
    assert!(err.contains("InstructionError") || err.contains("Custom"),
        "Expected InvalidOutcome error, got: {}", err);
}

#[test]
fn test_multiple_bettors_accumulate() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-multi");

    let (pool_pda, _) = find_prediction_pool_pda("pred-multi");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let s1 = svm.create_funded_account(1_000_000_000);
    let s1_ata = svm.create_ata(&mint, &s1.pubkey());
    svm.mint_tokens(&mint, &s1_ata, 1_000_000);
    let (bet1_pda, _) = find_prediction_bet_pda(&pool_pda, &s1.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet1_pda, &vault_pda,
        &s1_ata, &s1.pubkey(), 40_000, 0,
    ), &[&s1]);

    let s2 = svm.create_funded_account(1_000_000_000);
    let s2_ata = svm.create_ata(&mint, &s2.pubkey());
    svm.mint_tokens(&mint, &s2_ata, 1_000_000);
    let (bet2_pda, _) = find_prediction_bet_pda(&pool_pda, &s2.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet2_pda, &vault_pda,
        &s2_ata, &s2.pubkey(), 30_000, 1,
    ), &[&s2]);

    let s3 = svm.create_funded_account(1_000_000_000);
    let s3_ata = svm.create_ata(&mint, &s3.pubkey());
    svm.mint_tokens(&mint, &s3_ata, 1_000_000);
    let (bet3_pda, _) = find_prediction_bet_pda(&pool_pda, &s3.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet3_pda, &vault_pda,
        &s3_ata, &s3.pubkey(), 10_000, 2,
    ), &[&s3]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert_eq!(pool.total_bet_on_white, 40_000);
    assert_eq!(pool.total_bet_on_black, 30_000);
    assert_eq!(pool.total_bet_on_draw, 10_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Settlement
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_settle_prediction_pool_after_white_wins() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-settle-001");

    let (pool_pda, _) = find_prediction_pool_pda("pred-settle-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    set_game_status(&mut svm, &match_pda, GameStatus::WhiteWins, GameEndReason::Checkmate);

    let settle_ix = settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk);
    svm.send_ix(settle_ix, &[]);

    let pool: PredictionPool = svm.ctx.get_account(&pool_pda).unwrap();
    assert!(pool.settlement_processed);
}

#[test]
fn test_cannot_settle_twice() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-settle-002");

    let (pool_pda, _) = find_prediction_pool_pda("pred-settle-002");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    set_game_status(&mut svm, &match_pda, GameStatus::Draw, GameEndReason::Stalemate);

    let settle_ix = settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk);
    svm.send_ix(settle_ix, &[]);

    let settle_ix2 = settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk);
    let err = svm.send_ix_expect_err(settle_ix2, &[]);
    assert!(!err.is_empty(), "Expected error but transaction succeeded");
}

#[test]
fn test_cannot_settle_while_active() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-settle-active");

    let (pool_pda, _) = find_prediction_pool_pda("pred-settle-active");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let settle_ix = settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk);
    let err = svm.send_ix_expect_err(settle_ix, &[]);
    assert!(
        err.contains("InstructionError") || err.contains("Custom") || err.contains("AlreadyProcessed"),
        "Expected instruction error, got: {}", err
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Claim winnings (pull model)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_claim_winnings_after_white_wins() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-claim-001");

    let (pool_pda, _) = find_prediction_pool_pda("pred-claim-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 0,
    );
    svm.send_ix(init_ix, &[]);

    let s1 = svm.create_funded_account(1_000_000_000);
    let s1_ata = svm.create_ata(&mint, &s1.pubkey());
    svm.mint_tokens(&mint, &s1_ata, 200_000);
    let (bet1_pda, _) = find_prediction_bet_pda(&pool_pda, &s1.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet1_pda, &vault_pda,
        &s1_ata, &s1.pubkey(), 60_000, 0,
    ), &[&s1]);

    let s2 = svm.create_funded_account(1_000_000_000);
    let s2_ata = svm.create_ata(&mint, &s2.pubkey());
    svm.mint_tokens(&mint, &s2_ata, 200_000);
    let (bet2_pda, _) = find_prediction_bet_pda(&pool_pda, &s2.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet2_pda, &vault_pda,
        &s2_ata, &s2.pubkey(), 40_000, 1,
    ), &[&s2]);

    set_game_status(&mut svm, &match_pda, GameStatus::WhiteWins, GameEndReason::Checkmate);
    svm.send_ix(settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk), &[]);

    let balance_before = svm.get_token_balance(&s1_ata);
    let claim_ix = claim_prediction_winnings_ix(
        &match_pda, &pool_pda, &bet1_pda, &vault_pda, &s1_ata, &s1.pubkey(),
    );
    svm.send_ix(claim_ix, &[&s1]);
    let balance_after = svm.get_token_balance(&s1_ata);
    assert_eq!(balance_after - balance_before, 90_000);
}

#[test]
fn test_loser_claims_nothing() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-loser-001");

    let (pool_pda, _) = find_prediction_pool_pda("pred-loser-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 0,
    );
    svm.send_ix(init_ix, &[]);

    let loser = svm.create_funded_account(1_000_000_000);
    let loser_ata = svm.create_ata(&mint, &loser.pubkey());
    svm.mint_tokens(&mint, &loser_ata, 200_000);
    let (loser_bet_pda, _) = find_prediction_bet_pda(&pool_pda, &loser.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &loser_bet_pda, &vault_pda,
        &loser_ata, &loser.pubkey(), 50_000, 1,
    ), &[&loser]);

    set_game_status(&mut svm, &match_pda, GameStatus::WhiteWins, GameEndReason::Checkmate);
    svm.send_ix(settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk), &[]);

    let claim_ix = claim_prediction_winnings_ix(
        &match_pda, &pool_pda, &loser_bet_pda, &vault_pda, &loser_ata, &loser.pubkey(),
    );
    let err = svm.send_ix_expect_err(claim_ix, &[&loser]);
    assert!(err.contains("InstructionError") || err.contains("Custom"),
        "Expected NothingToClaim error, got: {}", err);
}

#[test]
fn test_cannot_double_claim() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, p1_ata, p2_ata, platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-dblclaim");

    let (pool_pda, _) = find_prediction_pool_pda("pred-dblclaim");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 0,
    );
    svm.send_ix(init_ix, &[]);

    let winner = svm.create_funded_account(1_000_000_000);
    let winner_ata = svm.create_ata(&mint, &winner.pubkey());
    svm.mint_tokens(&mint, &winner_ata, 200_000);
    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &winner.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &winner_ata, &winner.pubkey(), 50_000, 0,
    ), &[&winner]);

    set_game_status(&mut svm, &match_pda, GameStatus::WhiteWins, GameEndReason::Checkmate);
    svm.send_ix(settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk), &[]);

    let claim_ix = claim_prediction_winnings_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda, &winner_ata, &winner.pubkey(),
    );
    // Build it once and clone
    let claim_ix2 = Instruction {
        program_id: claim_ix.program_id,
        accounts: claim_ix.accounts.clone(),
        data: claim_ix.data.clone(),
    };
    svm.send_ix(claim_ix, &[&winner]);
    let err = svm.send_ix_expect_err(claim_ix2, &[&winner]);
    assert!(!err.is_empty(), "Expected error but transaction succeeded");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cancel bet
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_cancel_bet_when_aborted() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();

    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let (match_pda, _) = find_chess_match_pda("pred-cancel-001");
    let (escrow_pda, _) = find_escrow_pda("pred-cancel-001");
    let pfw = Keypair::new().pubkey();

    let init_ix = initialize_match_ix(
        &match_pda, &p1_pk, &mint,
        &p1_ata, &escrow_pda, "pred-cancel-001",
        100_000, 0, 200, &pfw, true,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 200_000);
    let join_ix = join_match_ix(&match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, 100_000);
    svm.send_ix(join_ix, &[&p2]);

    let move_ix = make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None);
    svm.send_ix(move_ix, &[]);

    // Init pool
    let (pool_pda, _) = find_prediction_pool_pda("pred-cancel-001");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);
    let init_pool_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_pool_ix, &[]);

    // Place bet
    let bettor = svm.create_funded_account(1_000_000_000);
    let bettor_ata = svm.create_ata(&mint, &bettor.pubkey());
    svm.mint_tokens(&mint, &bettor_ata, 200_000);
    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &bettor.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &bettor_ata, &bettor.pubkey(), 30_000, 0,
    ), &[&bettor]);

    // Abort match
    set_game_status(&mut svm, &match_pda, GameStatus::Aborted, GameEndReason::Aborted);

    // Cancel bet
    let balance_before = svm.get_token_balance(&bettor_ata);
    let cancel_ix = cancel_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda, &bettor_ata, &bettor.pubkey(),
    );
    svm.send_ix(cancel_ix, &[&bettor]);
    let balance_after = svm.get_token_balance(&bettor_ata);
    assert_eq!(balance_after - balance_before, 30_000);
    assert!(!svm.account_exists(&bet_pda));
}

#[test]
fn test_cannot_cancel_while_active() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let (_p2, mint, match_pda, _escrow, _p1_ata, _p2_ata, _platform_ata) =
        setup_match_for_prediction(&mut svm, &p1_pk, "pred-cancel-active");

    let (pool_pda, _) = find_prediction_pool_pda("pred-cancel-active");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);

    let init_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 200,
    );
    svm.send_ix(init_ix, &[]);

    let bettor = svm.create_funded_account(1_000_000_000);
    let bettor_ata = svm.create_ata(&mint, &bettor.pubkey());
    svm.mint_tokens(&mint, &bettor_ata, 200_000);
    let (bet_pda, _) = find_prediction_bet_pda(&pool_pda, &bettor.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda,
        &bettor_ata, &bettor.pubkey(), 10_000, 0,
    ), &[&bettor]);

    let cancel_ix = cancel_prediction_bet_ix(
        &match_pda, &pool_pda, &bet_pda, &vault_pda, &bettor_ata, &bettor.pubkey(),
    );
    let err = svm.send_ix_expect_err(cancel_ix, &[&bettor]);
    assert!(err.contains("InstructionError") || err.contains("Custom"),
        "Expected CannotCancelActiveMatch error, got: {}", err);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Full flow with platform fee
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_full_prediction_flow_with_platform_fee() {
    let mut svm = TestSvm::new();
    let p1_pk = svm.payer_pubkey();
    let platform_fee_wallet = Keypair::new();
    let mint = svm.create_mint(9);
    let p1_ata = svm.create_ata(&mint, &p1_pk);
    let platform_ata = svm.create_ata(&mint, &platform_fee_wallet.pubkey());
    svm.mint_tokens(&mint, &p1_ata, 1_000_000);

    let (match_pda, _) = find_chess_match_pda("pred-fullflow");
    let (escrow_pda, _) = find_escrow_pda("pred-fullflow");

    let init_ix = initialize_match_ix(
        &match_pda, &p1_pk, &mint,
        &p1_ata, &escrow_pda, "pred-fullflow",
        100_000, 0, 200, &platform_fee_wallet.pubkey(), true,
    );
    svm.send_ix(init_ix, &[]);

    let p2 = svm.create_funded_account(1_000_000_000);
    let p2_ata = svm.create_ata(&mint, &p2.pubkey());
    svm.mint_tokens(&mint, &p2_ata, 1_000_000);
    let join_ix = join_match_ix(&match_pda, &p2.pubkey(), &p2_ata, &escrow_pda, 100_000);
    svm.send_ix(join_ix, &[&p2]);

    svm.send_ix(make_move_ix(&match_pda, &p1_pk, 1, 4, 3, 4, None), &[]);

    // Init prediction pool with 10% fee
    let (pool_pda, _) = find_prediction_pool_pda("pred-fullflow");
    let (vault_pda, _) = find_prediction_pool_vault_pda(&pool_pda);
    let init_pool_ix = initialize_prediction_pool_ix(
        &match_pda, &pool_pda, &vault_pda, &mint, &p1_pk, 1000,
    );
    svm.send_ix(init_pool_ix, &[]);

    // 3 bettors: White 200k, Black 300k, Draw 100k = 600k total
    let s1 = svm.create_funded_account(1_000_000_000);
    let s1_ata = svm.create_ata(&mint, &s1.pubkey());
    svm.mint_tokens(&mint, &s1_ata, 500_000);
    let (b1_pda, _) = find_prediction_bet_pda(&pool_pda, &s1.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &b1_pda, &vault_pda,
        &s1_ata, &s1.pubkey(), 200_000, 0,
    ), &[&s1]);

    let s2 = svm.create_funded_account(1_000_000_000);
    let s2_ata = svm.create_ata(&mint, &s2.pubkey());
    svm.mint_tokens(&mint, &s2_ata, 500_000);
    let (b2_pda, _) = find_prediction_bet_pda(&pool_pda, &s2.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &b2_pda, &vault_pda,
        &s2_ata, &s2.pubkey(), 300_000, 1,
    ), &[&s2]);

    let s3 = svm.create_funded_account(1_000_000_000);
    let s3_ata = svm.create_ata(&mint, &s3.pubkey());
    svm.mint_tokens(&mint, &s3_ata, 500_000);
    let (b3_pda, _) = find_prediction_bet_pda(&pool_pda, &s3.pubkey());
    svm.send_ix(place_prediction_bet_ix(
        &match_pda, &pool_pda, &b3_pda, &vault_pda,
        &s3_ata, &s3.pubkey(), 100_000, 2,
    ), &[&s3]);

    set_game_status(&mut svm, &match_pda, GameStatus::WhiteWins, GameEndReason::Checkmate);
    svm.send_ix(settle_prediction_pool_ix(&match_pda, &pool_pda, &vault_pda, &p1_ata, &p2_ata, &platform_ata, &p1_pk), &[]);

    // Winner claims — new split math:
    // total=600k, winning=200k, losing=400k
    // settle transfers: 10% loser→winner=40k, 5%→loser=20k, 10%→platform=40k
    // vault remaining: 200k + 75% of 400k = 200k + 300k = 500k
    // s1 bet 200k / 200k winning * 500k = 500k
    let balance_before = svm.get_token_balance(&s1_ata);
    svm.send_ix(claim_prediction_winnings_ix(
        &match_pda, &pool_pda, &b1_pda, &vault_pda, &s1_ata, &s1.pubkey(),
    ), &[&s1]);
    let balance_after = svm.get_token_balance(&s1_ata);
    assert_eq!(balance_after - balance_before, 500_000);
}
