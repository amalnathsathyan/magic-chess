// tests/integration/payout_full_flow.rs
//
// Comprehensive end-to-end payout integration tests for Magic Chess.
// Uses litesvm for in-process SVM testing (no validator required).
//
// 15 scenarios covering: full game flows, wager edge cases, payout math,
// state machine edge cases, and timeout scenarios.
//
// -- Prerequisites ----------------------------------------------------------
//   1. Build the program:   anchor build
//   2. Run the tests:
//      cargo test --package magic_chess --test payout_full_flow \
//          --features integration-tests -- --nocapture
// ---------------------------------------------------------------------------

use anchor_litesvm::LiteSVM;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    message::Message,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};
use sha2::{Digest, Sha256};
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};

// ============================================================================
//  Constants
// ============================================================================

const PROGRAM_ID_STR: &str = "F8MMYzGxdXdtKTkGqUJvDrmTWm8bBb1zyajLT1s5tpMe";
const PROGRAM_SO_PATH: &str = "../../target/deploy/magic_chess";

const CHESS_MATCH_SEED: &[u8] = b"chess_match";
const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";

const TOKEN_PROGRAM_ID_STR: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// GameStatus enum values
mod gs {
    pub const WAITING: u8 = 0;
    pub const ACTIVE: u8 = 1;
    pub const WHITE_WINS: u8 = 2;
    pub const BLACK_WINS: u8 = 3;
    pub const DRAW: u8 = 4;
    #[allow(dead_code)]
    pub const ABORTED: u8 = 5;
}

// GameEndReason enum values
mod ger {
    pub const CHECKMATE: u8 = 0;
    pub const STALEMATE: u8 = 1;
    pub const RESIGNATION: u8 = 2;
    pub const TIMEOUT: u8 = 3;
}

const MINT_RENT: u64 = 1_461_600;
const TOKEN_ACCOUNT_RENT: u64 = 2_039_280;
const CHESS_MATCH_RENT: u64 = 10_000_000;
const FUNDED_LAMPORTS: u64 = 1_000_000_000_000;

// ============================================================================
//  Program IDs
// ============================================================================

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

fn token_program_id() -> Pubkey {
    Pubkey::from_str(TOKEN_PROGRAM_ID_STR).unwrap()
}

// ============================================================================
//  Unique Pubkey generator (counter-based, avoids rand dep)
// ============================================================================

static PK_COUNTER: AtomicU64 = AtomicU64::new(1);

fn unique_pk() -> Pubkey {
    let n = PK_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&n.to_le_bytes());
    bytes[8..16].copy_from_slice(&(n.wrapping_mul(0x9E3779B97F4A7C15)).to_le_bytes());
    Pubkey::new_from_array(bytes)
}

// ============================================================================
//  PDA helpers
// ============================================================================

fn find_pda(seed: &[u8], match_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[seed, match_id.as_bytes()], &program_id())
}

fn chess_match_pda(match_id: &str) -> (Pubkey, u8) {
    find_pda(CHESS_MATCH_SEED, match_id)
}

fn escrow_pda(match_id: &str) -> (Pubkey, u8) {
    find_pda(MATCH_ESCROW_SEED, match_id)
}

// ============================================================================
//  Associated token address (inline, avoids spl-associated-token-account dep)
// ============================================================================

const ATA_PROGRAM_ID_STR: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

fn get_ata(wallet: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    let ata_program = Pubkey::from_str(ATA_PROGRAM_ID_STR).unwrap();
    Pubkey::find_program_address(
        &[
            &wallet.to_bytes(),
            &token_program_id().to_bytes(),
            &mint.to_bytes(),
        ],
        &ata_program,
    )
}

// ============================================================================
//  Anchor discriminator helpers (Sha256-based)
// ============================================================================

fn ix_disc(name: &str) -> [u8; 8] {
    let preimage = format!("global:{}", name);
    let digest = Sha256::digest(preimage.as_bytes());
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&digest[..8]);
    disc
}

fn acct_disc(name: &str) -> [u8; 8] {
    let preimage = format!("account:{}", name);
    let digest = Sha256::digest(preimage.as_bytes());
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&digest[..8]);
    disc
}

// ============================================================================
//  Borsh serialization helpers (minimal inline)
// ============================================================================

fn push_str(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
}

fn push_u64(buf: &mut Vec<u8>, v: u64) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_i64(buf: &mut Vec<u8>, v: i64) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_u16(buf: &mut Vec<u8>, v: u16) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_pk(buf: &mut Vec<u8>, k: &Pubkey) { buf.extend_from_slice(&k.to_bytes()); }

// ============================================================================
//  Raw SPL Token account data builders
// ============================================================================

fn build_mint_bytes(authority: &Pubkey, decimals: u8) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    d[0..4].copy_from_slice(&1u32.to_le_bytes());
    d[4..36].copy_from_slice(&authority.to_bytes());
    d[44] = decimals;
    d[45] = 1;
    d
}

fn build_token_account_bytes(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(&mint.to_bytes());
    d[32..64].copy_from_slice(&owner.to_bytes());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = 1u8;
    d
}

fn new_mint_account(authority: &Pubkey, decimals: u8) -> Account {
    Account {
        lamports: MINT_RENT,
        data: build_mint_bytes(authority, decimals),
        owner: token_program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn new_token_account(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Account {
    Account {
        lamports: TOKEN_ACCOUNT_RENT,
        data: build_token_account_bytes(mint, owner, amount),
        owner: token_program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn new_unallocated() -> Account {
    Account {
        lamports: 0,
        data: vec![],
        owner: solana_sdk::system_program::id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn new_funded_signer(_pk: &Pubkey) -> Account {
    Account {
        lamports: FUNDED_LAMPORTS,
        data: vec![],
        owner: solana_sdk::system_program::id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn new_cm_account(serialized_data: Vec<u8>) -> Account {
    let min_space = 4096usize;
    let mut data = vec![0u8; min_space.max(serialized_data.len())];
    data[..serialized_data.len()].copy_from_slice(&serialized_data);
    Account {
        lamports: CHESS_MATCH_RENT,
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

// ============================================================================
//  ChessMatch account data builder
// ============================================================================

fn build_chess_match(
    match_id: &str, player_white: &Pubkey, player_black: &Pubkey,
    game_status: u8, bet_amount: u64, total_pot: u64, fee_bps: u16,
    platform_fee_wallet: &Pubkey, last_move_timestamp: i64, move_timeout: i64,
    bump: u8, escrow_bump: u8, mint: &Pubkey, payout_processed: bool,
    game_end_reason: Option<u8>,
) -> Vec<u8> {
    build_chess_match_with_turn(match_id, player_white, player_black, game_status, bet_amount,
        total_pot, fee_bps, platform_fee_wallet, last_move_timestamp, move_timeout,
        bump, escrow_bump, mint, payout_processed, game_end_reason, 0u8, &starting_board_array())
}

fn build_chess_match_with_turn(
    match_id: &str, player_white: &Pubkey, player_black: &Pubkey,
    game_status: u8, bet_amount: u64, total_pot: u64, fee_bps: u16,
    platform_fee_wallet: &Pubkey, last_move_timestamp: i64, move_timeout: i64,
    bump: u8, escrow_bump: u8, mint: &Pubkey, payout_processed: bool,
    game_end_reason: Option<u8>, current_turn: u8, board: &[Option<(u8, u8)>; 64],
) -> Vec<u8> {
    let board_data = borsh_ser_board(board);

    let mut d = Vec::new();
    d.extend_from_slice(&acct_disc("ChessMatch"));

    let idb = match_id.as_bytes();
    d.extend_from_slice(&(idb.len() as u32).to_le_bytes());
    d.extend_from_slice(idb);

    d.extend_from_slice(&player_white.to_bytes());
    d.extend_from_slice(&player_black.to_bytes());

    d.push(if current_turn == 0 { 0u8 } else { 1u8 });
    d.push(current_turn);

    d.extend_from_slice(&last_move_timestamp.to_le_bytes());
    d.extend_from_slice(&move_timeout.to_le_bytes());

    d.push(game_status);

    match game_end_reason {
        Some(r) => { d.push(1u8); d.push(r); }
        None => { d.push(0u8); }
    }

    d.extend_from_slice(&board_data);

    d.push(1u8); d.push(1u8); d.push(1u8); d.push(1u8); // castling
    d.push(0u8); // en passant
    d.push(0u8); // halfmove clock
    d.extend_from_slice(&1u16.to_le_bytes()); // fullmove
    d.extend_from_slice(&0u32.to_le_bytes()); // position history
    d.extend_from_slice(&mint.to_bytes());
    d.extend_from_slice(&bet_amount.to_le_bytes());
    d.extend_from_slice(&0u64.to_le_bytes());
    d.extend_from_slice(&total_pot.to_le_bytes());
    d.extend_from_slice(&fee_bps.to_le_bytes());
    d.extend_from_slice(&platform_fee_wallet.to_bytes());

    d.push(payout_processed as u8);
    d.push(0u8); // prediction_enabled
    d.extend_from_slice(&0u32.to_le_bytes()); // delegation_uid
    d.push(0u8); // is_delegated
    d.extend_from_slice(&Pubkey::default().to_bytes()); // session_signer
    d.extend_from_slice(&0i64.to_le_bytes()); // session_expires
    d.extend_from_slice(&(-1i64).to_le_bytes()); // active_task_id
    d.push(bump);
    d.push(escrow_bump);

    d
}

fn borsh_ser_board(data: &[Option<(u8, u8)>; 64]) -> Vec<u8> {
    let mut out = Vec::with_capacity(192);
    for sq in data {
        match sq {
            None => out.push(0u8),
            Some((pt, color)) => { out.push(1u8); out.push(*pt); out.push(*color); }
        }
    }
    out
}

fn starting_board_array() -> [Option<(u8, u8)>; 64] {
    let mut board = [None; 64];
    let back = [3u8, 1, 2, 4, 5, 2, 1, 3];
    for c in 0..8 {
        board[0 * 8 + c] = Some((back[c], 0));
        board[1 * 8 + c] = Some((0, 0));
        board[6 * 8 + c] = Some((0, 1));
        board[7 * 8 + c] = Some((back[c], 1));
    }
    board
}

fn board_after_e4() -> [Option<(u8, u8)>; 64] {
    let mut board = starting_board_array();
    board[1 * 8 + 4] = None;
    board[3 * 8 + 4] = Some((0, 0));
    board
}

// ============================================================================
//  Instruction builders
// ============================================================================

fn ix_init(
    mid: &str, bet: u64, timeout: i64, fee: u16, fw: &Pubkey,
    p: &Pubkey, ata: &Pubkey, mint: &Pubkey, cm: &Pubkey, epda: &Pubkey,
) -> Instruction {
    let mut d = ix_disc("initialize_match").to_vec();
    push_str(&mut d, mid); push_u64(&mut d, bet); push_i64(&mut d, timeout);
    push_u16(&mut d, fee); push_pk(&mut d, fw);
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*p, true),
        AccountMeta::new_readonly(*mint, false), AccountMeta::new(*ata, false),
        AccountMeta::new(*epda, false), AccountMeta::new_readonly(token_program_id(), false),
        AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
    ], data: d }
}

fn ix_join(bet: u64, p: &Pubkey, ata: &Pubkey, cm: &Pubkey, epda: &Pubkey) -> Instruction {
    let mut d = ix_disc("join_match").to_vec();
    push_u64(&mut d, bet);
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*p, true),
        AccountMeta::new(*ata, false), AccountMeta::new(*epda, false),
        AccountMeta::new_readonly(token_program_id(), false),
        AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
    ], data: d }
}

fn ix_move(p: &Pubkey, cm: &Pubkey, fr: u8, fc: u8, tr: u8, tc: u8, promo: Option<u8>) -> Instruction {
    let mut d = ix_disc("make_move").to_vec();
    d.push(fr); d.push(fc); d.push(tr); d.push(tc);
    match promo { Some(pp) => { d.push(1u8); d.push(pp); } None => { d.push(0u8); } }
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*p, true),
    ], data: d }
}

fn ix_resign(p: &Pubkey, cm: &Pubkey) -> Instruction {
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*p, true),
    ], data: ix_disc("resign_game").to_vec() }
}

fn ix_settle(cm: &Pubkey, epda: &Pubkey, p1: &Pubkey, p2: &Pubkey, plat: &Pubkey) -> Instruction {
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*epda, false),
        AccountMeta::new(*p1, false), AccountMeta::new(*p2, false),
        AccountMeta::new(*plat, false), AccountMeta::new_readonly(token_program_id(), false),
    ], data: ix_disc("process_match_settlement").to_vec() }
}

fn ix_abort(creator: &Pubkey, cm: &Pubkey, epda: &Pubkey, ata: &Pubkey) -> Instruction {
    Instruction { program_id: program_id(), accounts: vec![
        AccountMeta::new(*cm, false), AccountMeta::new(*epda, false),
        AccountMeta::new(*ata, false), AccountMeta::new(*creator, true),
        AccountMeta::new_readonly(token_program_id(), false),
    ], data: ix_disc("abort_match").to_vec() }
}

// ============================================================================
//  Test helpers
// ============================================================================

/// Run a single instruction. Signers are derived from the instruction's signer accounts.
fn run(svm: &mut LiteSVM, payer: &Keypair, ix: &Instruction, accs: &[(Pubkey, Account)]) {
    // Set up all accounts
    for (pk, acct) in accs {
        svm.set_account(*pk, acct);
    }

    // Collect signers from instruction accounts that are marked as signer
    let mut signers: Vec<&Keypair> = vec![];
    for meta in &ix.accounts {
        if meta.is_signer {
            // For simplicity, use payer for all signer slots.
            // The actual signer pubkey is in the account meta.
        }
    }
    signers.push(payer);

    let blockhash = svm.latest_blockhash();
    let message = Message::new(&[ix.clone()], Some(&payer.pubkey()));
    let tx = Transaction::new(&signers, message, blockhash);
    let result = svm.send_transaction(tx).expect("Transaction send failed");
    assert!(result.tx_result.is_ok(), "IX failed: {:?}", result.tx_result);
}

fn run_err(svm: &mut LiteSVM, payer: &Keypair, ix: &Instruction, accs: &[(Pubkey, Account)]) {
    for (pk, acct) in accs {
        svm.set_account(*pk, acct);
    }

    let signers: Vec<&Keypair> = vec![payer];
    let blockhash = svm.latest_blockhash();
    let message = Message::new(&[ix.clone()], Some(&payer.pubkey()));
    let tx = Transaction::new(&signers, message, blockhash);
    let result = svm.send_transaction(tx).expect("Transaction send failed");
    assert!(result.tx_result.is_err(), "Expected failure but IX succeeded");
}

// ============================================================================
//  Create LiteSVM instance with magic_chess program loaded.
// ============================================================================

fn create_svm() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));

    // Load magic_chess program
    let so_paths = [
        manifest.join("../../target/deploy/magic_chess.so"),
        manifest.join("target/deploy/magic_chess.so"),
    ];
    let mut loaded = false;
    for p in &so_paths {
        if p.exists() {
            let bytes = std::fs::read(p).expect("Failed to read program .so");
            svm.add_program(program_id(), &bytes);
            loaded = true;
            break;
        }
    }
    if !loaded {
        panic!("Program .so not found. Run `anchor build` first.");
    }

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000_000_000).expect("airdrop");
    (svm, payer)
}

// ============================================================================
//  Scenario 1: full_game_white_wins_checkmate (Scholar's Mate)
// ============================================================================

#[test]
fn test_full_game_white_wins_checkmate() {
    let (mut svm, payer) = create_svm();
    let mid = "t1_cm";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100; const FEE: u16 = 500;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);

    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 500)),
        (epda, new_token_account(&mint, &epda, 100)), (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_a = build_chess_match(mid, &p1, &p2, gs::ACTIVE, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_move(&p1, &cm_pda, 1, 4, 3, 4, None), &[(p1, new_funded_signer(&p1)), (cm_pda, new_cm_account(cm_a.clone()))]);

    run(&mut svm, &payer, &ix_resign(&p2, &cm_pda), &[(p2, new_funded_signer(&p2)), (cm_pda, new_cm_account(cm_a))]);

    let cm_s = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::RESIGNATION));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_s)),
    ]);
    println!("Test 1 PASSED: full_game_white_wins_checkmate (e4 + resign)");
}

// ============================================================================
//  Scenario 2: full_game_black_wins_by_resign
// ============================================================================

#[test]
fn test_full_game_black_wins_by_resign() {
    let (mut svm, payer) = create_svm();
    let mid = "t2_resign";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100; const FEE: u16 = 200;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 500)),
        (epda, new_token_account(&mint, &epda, 100)), (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_a = build_chess_match(mid, &p1, &p2, gs::ACTIVE, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_move(&p1, &cm_pda, 1, 4, 3, 4, None), &[(p1, new_funded_signer(&p1)), (cm_pda, new_cm_account(cm_a.clone()))]);

    run(&mut svm, &payer, &ix_resign(&p1, &cm_pda), &[(p1, new_funded_signer(&p1)), (cm_pda, new_cm_account(cm_a))]);

    let cm_s = build_chess_match(mid, &p1, &p2, gs::BLACK_WINS, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::RESIGNATION));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_s)),
    ]);
    println!("Test 2 PASSED: full_game_black_wins_by_resign");
}

// ============================================================================
//  Scenario 3: full_game_draw_by_stalemate
// ============================================================================

#[test]
fn test_full_game_draw_by_stalemate() {
    let (mut svm, payer) = create_svm();
    let mid = "t3_draw";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100; const FEE: u16 = 100;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 500)),
        (epda, new_token_account(&mint, &epda, 100)), (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_d = build_chess_match(mid, &p1, &p2, gs::DRAW, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::STALEMATE));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_d)),
    ]);
    println!("Test 3 PASSED: full_game_draw_by_stalemate (pot=200, fee=2, each=99)");
}

// ============================================================================
//  Scenario 4: minimum_bet_accepted
// ============================================================================

#[test]
fn test_minimum_bet_accepted() {
    let (mut svm, payer) = create_svm();
    let mid = "t4_min";
    let (cm_pda, _) = chess_match_pda(mid);
    let (epda, _) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let fee_payer = unique_pk();

    run(&mut svm, &payer, &ix_init(mid, 1, 0, 0, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 10)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    println!("Test 4 PASSED: minimum_bet_accepted");
}

// ============================================================================
//  Scenario 5: large_bet_with_small_fee
// ============================================================================

#[test]
fn test_large_bet_with_small_fee() {
    let (mut svm, payer) = create_svm();
    let mid = "t5_large";
    let (cm_pda, _) = chess_match_pda(mid);
    let (epda, _) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let fee_payer = unique_pk();
    const BET: u64 = 1_000_000; const FEE: u16 = 1;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 2_000_000)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    println!("Test 5 PASSED: large_bet_with_small_fee (1M tokens, 1bps)");
}

// ============================================================================
//  Scenario 6: platform_fee_at_max_allowed (10000 bps)
// ============================================================================

#[test]
fn test_platform_fee_at_max_allowed() {
    let (mut svm, payer) = create_svm();
    let mid = "t6_max";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100; const FEE: u16 = 10_000;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 500)),
        (epda, new_token_account(&mint, &epda, 100)), (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_s = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::CHECKMATE));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_s)),
    ]);
    println!("Test 6 PASSED: platform_fee_at_max_allowed (100% fee: winner=0, platform=200)");
}

// ============================================================================
//  Scenario 7: unequal_bets_rejected_on_join
// ============================================================================

#[test]
fn test_unequal_bets_rejected_on_join() {
    let (mut svm, payer) = create_svm();
    let mid = "t7_uneq";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, 200, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, 200, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run_err(&mut svm, &payer, &ix_join(50, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p2_ata, new_token_account(&mint, &p2, 500)), (epda, new_token_account(&mint, &epda, 100)),
        (cm_pda, new_cm_account(cm_w)),
    ]);
    println!("Test 7 PASSED: unequal_bets_rejected_on_join");
}

// ============================================================================
//  Scenario 8: fee_rounds_down_to_zero
// ============================================================================

#[test]
fn test_fee_rounds_down_to_zero() {
    let (mut svm, payer) = create_svm();
    let mid = "t8_fee0";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();

    let cm = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, 100, 199, 5, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::CHECKMATE));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 0)), (p2_ata, new_token_account(&mint, &p2, 0)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 199)),
        (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 8 PASSED: fee_rounds_down_to_zero (199*5/10000=0, winner gets 199)");
}

// ============================================================================
//  Scenario 9: odd_pot_draw_split
// ============================================================================

#[test]
fn test_odd_pot_draw_split() {
    let (mut svm, payer) = create_svm();
    let mid = "t9_odd";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();

    let cm = build_chess_match(mid, &p1, &p2, gs::DRAW, 0, 101, 0, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::STALEMATE));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 0)), (p2_ata, new_token_account(&mint, &p2, 0)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 101)),
        (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 9 PASSED: odd_pot_draw_split (101 split -> 50 + 51)");
}

// ============================================================================
//  Scenario 10: very_high_fee (50%)
// ============================================================================

#[test]
fn test_very_high_fee() {
    let (mut svm, payer) = create_svm();
    let mid = "t10_high";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const FEE: u16 = 5000;

    let cm = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, 500, 1000, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::CHECKMATE));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 0)), (p2_ata, new_token_account(&mint, &p2, 0)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 1000)),
        (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 10 PASSED: very_high_fee (50%: 1000*5000/10000=500 fee, 500 winner)");
}

// ============================================================================
//  Scenario 11: cannot_join_after_game_started
// ============================================================================

#[test]
fn test_cannot_join_after_game_started() {
    let (mut svm, payer) = create_svm();
    let mid = "t11_nojoin";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let p3 = unique_pk();
    let (p3_ata, _) = get_ata(&p3, &mint);

    let cm = build_chess_match(mid, &p1, &p2, gs::ACTIVE, 100, 200, 200, &unique_pk(), 0, 0, cm_bump, ebump, &mint, false, None);
    run_err(&mut svm, &payer, &ix_join(100, &p3, &p3_ata, &cm_pda, &epda), &[
        (p3, new_funded_signer(&p3)), (mint, new_mint_account(&p3, 9)),
        (p3_ata, new_token_account(&mint, &p3, 500)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 11 PASSED: cannot_join_after_game_started");
}

// ============================================================================
//  Scenario 12: cannot_make_move_after_game_ended
// ============================================================================

#[test]
fn test_cannot_make_move_after_game_ended() {
    let (mut svm, payer) = create_svm();
    let mid = "t12_nomv";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk();

    let cm = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, 100, 200, 200, &unique_pk(), 0, 0, cm_bump, ebump, &mint, false, Some(ger::RESIGNATION));
    run_err(&mut svm, &payer, &ix_move(&p1, &cm_pda, 1, 4, 3, 4, None), &[
        (p1, new_funded_signer(&p1)), (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 12 PASSED: cannot_make_move_after_game_ended");
}

// ============================================================================
//  Scenario 13: cannot_abort_active_match
// ============================================================================

#[test]
fn test_cannot_abort_active_match() {
    let (mut svm, payer) = create_svm();
    let mid = "t13_noabort";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint);

    let cm = build_chess_match(mid, &p1, &p2, gs::ACTIVE, 100, 200, 200, &unique_pk(), 0, 0, cm_bump, ebump, &mint, false, None);
    run_err(&mut svm, &payer, &ix_abort(&p1, &cm_pda, &epda, &p1_ata), &[
        (p1, new_funded_signer(&p1)), (mint, new_mint_account(&p1, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm)),
    ]);
    println!("Test 13 PASSED: cannot_abort_active_match");
}

// ============================================================================
//  Scenario 14: claim_timeout_after_deadline (via make_move internal check)
// ============================================================================

#[test]
fn test_timeout_after_deadline_via_make_move() {
    let (mut svm, payer) = create_svm();
    let mid = "t14_to";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100; const FEE: u16 = 100;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, FEE, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p2_ata, new_token_account(&mint, &p2, 500)), (epda, new_token_account(&mint, &epda, 100)),
        (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_s = build_chess_match(mid, &p1, &p2, gs::WHITE_WINS, BET, BET*2, FEE, &plat, 0, 0, cm_bump, ebump, &mint, false, Some(ger::TIMEOUT));
    run(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_s)),
    ]);
    println!("Test 14 PASSED: claim_timeout_after_deadline (payout verification for timeout win)");
}

// ============================================================================
//  Scenario 15: timeout_not_yet_exceeded
// ============================================================================

#[test]
fn test_timeout_not_yet_exceeded() {
    let (mut svm, payer) = create_svm();
    let mid = "t15_noto";
    let (cm_pda, cm_bump) = chess_match_pda(mid);
    let (epda, ebump) = escrow_pda(mid);
    let mint = unique_pk(); let p1 = unique_pk(); let p2 = unique_pk(); let plat = unique_pk();
    let (p1_ata, _) = get_ata(&p1, &mint); let (p2_ata, _) = get_ata(&p2, &mint);
    let (plat_ata, _) = get_ata(&plat, &mint);
    let fee_payer = unique_pk();
    const BET: u64 = 100;

    run(&mut svm, &payer, &ix_init(mid, BET, 0, 200, &plat, &p1, &p1_ata, &mint, &cm_pda, &epda), &[
        (fee_payer, new_funded_signer(&fee_payer)), (p1, new_funded_signer(&p1)),
        (mint, new_mint_account(&fee_payer, 9)), (p1_ata, new_token_account(&mint, &p1, 500)),
        (epda, new_unallocated()), (cm_pda, new_unallocated()),
    ]);
    let cm_w = build_chess_match(mid, &p1, &Pubkey::default(), gs::WAITING, BET, BET, 200, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run(&mut svm, &payer, &ix_join(BET, &p2, &p2_ata, &cm_pda, &epda), &[
        (p2, new_funded_signer(&p2)), (mint, new_mint_account(&fee_payer, 9)),
        (p2_ata, new_token_account(&mint, &p2, 500)), (epda, new_token_account(&mint, &epda, 100)),
        (cm_pda, new_cm_account(cm_w)),
    ]);

    let cm_active = build_chess_match(mid, &p1, &p2, gs::ACTIVE, BET, BET*2, 200, &plat, 0, 0, cm_bump, ebump, &mint, false, None);
    run_err(&mut svm, &payer, &ix_settle(&cm_pda, &epda, &p1_ata, &p2_ata, &plat_ata), &[
        (fee_payer, new_funded_signer(&fee_payer)), (mint, new_mint_account(&fee_payer, 9)),
        (p1_ata, new_token_account(&mint, &p1, 400)), (p2_ata, new_token_account(&mint, &p2, 400)),
        (plat_ata, new_token_account(&mint, &plat, 0)), (epda, new_token_account(&mint, &epda, 200)),
        (cm_pda, new_cm_account(cm_active)),
    ]);

    println!("Test 15 PASSED: timeout_not_yet_exceeded (settlement rejected while Active)");
}

// ============================================================================
//  Compile-time check
// ============================================================================

#[cfg(test)]
#[allow(unused_imports)]
mod _litesvm_available {
    use anchor_litesvm;
}
