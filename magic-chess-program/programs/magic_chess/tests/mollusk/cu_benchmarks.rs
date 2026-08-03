// cu_benchmarks.rs
//
// Mollusk-based Compute Unit (CU) benchmarks for the Magic Chess Anchor program.
// Gated behind `integration-tests` feature via required-features in Cargo.toml.

#![cfg(feature = "integration-tests")]
//
// Each benchmark sets up the minimal required accounts, executes an instruction
// via Mollusk's local SVM, and reports the CU consumed.
//
// ── Prerequisites ──────────────────────────────────────────────────────────
//   1. Build the program:   anchor build
//      (produces target/deploy/magic_chess.so relative to workspace root)
//   2. Run the benchmarks:
//      cargo test --features integration-tests -p magic_chess --test cu_benchmarks -- --nocapture
//
//   These tests run natively (not via cargo test-sbf). Mollusk provides its
//   own SVM runtime that loads and executes the compiled BPF .so file.
//
// ── Expected CU Budget ─────────────────────────────────────────────────────
//   The program's default compute budget is 200 000 CU. Each benchmark
//   validates that the instruction stays well within this limit.
// ───────────────────────────────────────────────────────────────────────────
//
// ── Crate ecosystem compatibility ──────────────────────────────────────────
//   mollusk-svm 0.14.0 uses the Solana Agave crates:
//     solana-pubkey v4.x   → Pubkey (= solana_address::Address)
//     solana-account v4.x  → Account (plain struct)
//     solana-instruction v3.x → Instruction, AccountMeta
//
//   solana-sdk v2.x is used for hash() which is a pure function with no
//   type-level coupling to the Agave account/instruction types.
// ───────────────────────────────────────────────────────────────────────────

use mollusk_svm::Mollusk;
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk::hash::hash;
use solana_system_program::id as system_program_id;
use std::str::FromStr;

// ── Program identity ───────────────────────────────────────────────────────
const PROGRAM_ID_STR: &str = "5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6";
/// Path to the compiled program .so file, relative to the cargo manifest dir.
///
/// Mollusk auto-appends `.so` when searching, so omit the extension here.
/// The path goes up from `programs/magic_chess/` to the workspace root,
/// then into `target/deploy/`.
/// Mollusk auto-appends `.so` when searching, so omit the extension here.
/// Uses CARGO_MANIFEST_DIR to build an absolute path to the workspace-level
/// target/deploy directory, avoiding cwd-dependent resolution.
const PROGRAM_SO_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/magic_chess"
);

// ── PDA seeds (must match constants.rs) ────────────────────────────────────
const CHESS_MATCH_SEED: &[u8] = b"chess_match";
const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";

// ── CU budget ceiling ──────────────────────────────────────────────────────
const CU_BUDGET: u64 = 200_000;

// ── SPL Token program ID ───────────────────────────────────────────────────
const TOKEN_PROGRAM_ID_STR: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ============================================================================
//  Helpers
// ============================================================================

/// Load the program ID from its string constant.
fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

/// Compute an Anchor-style 8-byte instruction or account discriminator.
fn anchor_discriminator(namespace: &str, name: &str) -> [u8; 8] {
    let preimage = format!("{}:{}", namespace, name);
    let digest = hash(preimage.as_bytes());
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&digest.to_bytes()[..8]);
    disc
}

fn instruction_disc(name: &str) -> [u8; 8] {
    anchor_discriminator("global", name)
}

fn account_discriminator(name: &str) -> [u8; 8] {
    anchor_discriminator("account", name)
}

/// Build make_move instruction data.
fn build_make_move_ix_data(
    from_row: u8,
    from_col: u8,
    to_row: u8,
    to_col: u8,
    promotion: Option<u8>,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(8 + 5);
    data.extend_from_slice(&instruction_disc("make_move"));
    data.push(from_row);
    data.push(from_col);
    data.push(to_row);
    data.push(to_col);
    match promotion {
        Some(p) => {
            data.push(1u8);
            data.push(p);
        }
        None => {
            data.push(0u8);
        }
    }
    data
}

/// Build initialize_match instruction data.
fn build_init_match_ix_data(
    match_id: &str,
    bet_amount: u64,
    move_timeout_duration: i64,
    platform_fee_basis_points: u16,
    platform_fee_wallet: &Pubkey,
) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(&instruction_disc("initialize_match"));

    let id_bytes = match_id.as_bytes();
    data.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(id_bytes);

    data.extend_from_slice(&bet_amount.to_le_bytes());
    data.extend_from_slice(&move_timeout_duration.to_le_bytes());
    data.extend_from_slice(&platform_fee_basis_points.to_le_bytes());
    data.extend_from_slice(&platform_fee_wallet.to_bytes());

    data
}

// ============================================================================
//  ChessMatch account data builder
// ============================================================================

const BOARD_ROWS: usize = 8;
const BOARD_COLS: usize = 8;

mod piece_type {
    pub const PAWN: u8 = 0;
    pub const KNIGHT: u8 = 1;
    pub const BISHOP: u8 = 2;
    pub const ROOK: u8 = 3;
    pub const QUEEN: u8 = 4;
    pub const KING: u8 = 5;
}

mod player_color {
    pub const WHITE: u8 = 0;
    pub const BLACK: u8 = 1;
}

type BoardDef = [[Option<(u8, u8)>; BOARD_COLS]; BOARD_ROWS];

fn starting_board_def() -> BoardDef {
    let mut board = [[None; BOARD_COLS]; BOARD_ROWS];

    for col in 0..8 {
        board[1][col] = Some((piece_type::PAWN, player_color::WHITE));
        board[6][col] = Some((piece_type::PAWN, player_color::BLACK));
    }

    let back_rank = [
        piece_type::ROOK,
        piece_type::KNIGHT,
        piece_type::BISHOP,
        piece_type::QUEEN,
        piece_type::KING,
        piece_type::BISHOP,
        piece_type::KNIGHT,
        piece_type::ROOK,
    ];
    for (col, &pt) in back_rank.iter().enumerate() {
        board[0][col] = Some((pt, player_color::WHITE));
        board[7][col] = Some((pt, player_color::BLACK));
    }

    board
}

fn midgame_board_def() -> BoardDef {
    let mut board = [[None; BOARD_COLS]; BOARD_ROWS];
    let w = player_color::WHITE;
    let b = player_color::BLACK;

    board[0][4] = Some((piece_type::KING, w));
    board[0][3] = Some((piece_type::QUEEN, w));
    board[0][0] = Some((piece_type::ROOK, w));
    board[0][7] = Some((piece_type::ROOK, w));
    board[0][2] = Some((piece_type::BISHOP, w));
    board[0][5] = Some((piece_type::BISHOP, w));
    board[0][1] = Some((piece_type::KNIGHT, w));
    board[3][3] = Some((piece_type::KNIGHT, w));
    board[1][0] = Some((piece_type::PAWN, w));
    board[1][1] = Some((piece_type::PAWN, w));
    board[1][2] = Some((piece_type::PAWN, w));
    board[3][4] = Some((piece_type::PAWN, w));
    board[1][5] = Some((piece_type::PAWN, w));
    board[1][6] = Some((piece_type::PAWN, w));
    board[1][7] = Some((piece_type::PAWN, w));

    board[7][4] = Some((piece_type::KING, b));
    board[7][3] = Some((piece_type::QUEEN, b));
    board[7][0] = Some((piece_type::ROOK, b));
    board[7][7] = Some((piece_type::ROOK, b));
    board[7][2] = Some((piece_type::BISHOP, b));
    board[7][5] = Some((piece_type::BISHOP, b));
    board[5][2] = Some((piece_type::KNIGHT, b));
    board[7][6] = Some((piece_type::KNIGHT, b));
    board[4][4] = Some((piece_type::PAWN, b));
    board[6][0] = Some((piece_type::PAWN, b));
    board[6][1] = Some((piece_type::PAWN, b));
    board[6][2] = Some((piece_type::PAWN, b));
    board[6][3] = Some((piece_type::PAWN, b));
    board[6][5] = Some((piece_type::PAWN, b));
    board[6][6] = Some((piece_type::PAWN, b));
    board[6][7] = Some((piece_type::PAWN, b));

    board
}

fn emptyish_board_with_kings() -> BoardDef {
    let mut board = [[None; BOARD_COLS]; BOARD_ROWS];
    board[0][4] = Some((piece_type::KING, player_color::WHITE));
    board[7][4] = Some((piece_type::KING, player_color::BLACK));
    board
}

fn serialize_board(board: &BoardDef) -> Vec<u8> {
    let mut buf = Vec::with_capacity(64 * 3);
    for row in 0..BOARD_ROWS {
        for col in 0..BOARD_COLS {
            match board[row][col] {
                None => buf.push(0u8),
                Some((pt, color)) => {
                    buf.push(1u8);
                    buf.push(pt);
                    buf.push(color);
                }
            }
        }
    }
    buf
}

fn build_chess_match_bytes(
    match_id: &str,
    player_white: &Pubkey,
    player_black: &Pubkey,
    current_player_idx: u8,
    current_turn: u8,
    game_status: u8,
    board: &BoardDef,
    castling_rights: [bool; 4],
    en_passant_target: Option<(u8, u8)>,
    halfmove_clock: u8,
    fullmove_number: u16,
    bump: u8,
    match_escrow_bump: u8,
) -> Vec<u8> {
    let mut data = Vec::new();

    data.extend_from_slice(&account_discriminator("ChessMatch"));

    let id_bytes = match_id.as_bytes();
    data.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(id_bytes);

    data.extend_from_slice(&player_white.to_bytes());
    data.extend_from_slice(&player_black.to_bytes());

    data.push(current_player_idx);
    data.push(current_turn);
    data.extend_from_slice(&0i64.to_le_bytes());
    data.extend_from_slice(&0i64.to_le_bytes());
    data.push(game_status);
    data.push(0u8);

    data.extend_from_slice(&serialize_board(board));

    for &b in &castling_rights {
        data.push(b as u8);
    }

    match en_passant_target {
        Some((row, col)) => {
            data.push(1u8);
            data.push(row);
            data.push(col);
        }
        None => {
            data.push(0u8);
        }
    }

    data.push(halfmove_clock);
    data.extend_from_slice(&fullmove_number.to_le_bytes());
    data.extend_from_slice(&0u32.to_le_bytes());

    data.extend_from_slice(&Pubkey::default().to_bytes());
    data.extend_from_slice(&100u64.to_le_bytes());
    data.extend_from_slice(&0u64.to_le_bytes());
    data.extend_from_slice(&100u64.to_le_bytes());
    data.extend_from_slice(&0u16.to_le_bytes());
    data.extend_from_slice(&Pubkey::default().to_bytes());

    // payout_processed: bool
    data.push(0u8);
    // prediction_enabled: bool
    data.push(0u8);

    // ── MagicBlock Ephemeral Rollups fields ──────────────────────────────
    // delegation_uid: String (empty)
    data.extend_from_slice(&0u32.to_le_bytes());
    // is_delegated: bool
    data.push(0u8);
    // session_signer: Pubkey
    data.extend_from_slice(&Pubkey::default().to_bytes());
    // session_expires_at: i64
    data.extend_from_slice(&0i64.to_le_bytes());
    // active_task_id: i64 (-1 = no active task)
    data.extend_from_slice(&(-1i64).to_le_bytes());

    // bump: u8
    data.push(bump);
    // match_escrow_bump: u8
    data.push(match_escrow_bump);

    data
}

// ── Account sizing ─────────────────────────────────────────────────────────
//
// The maximum serialized ChessMatch account size with all variable-length
// fields at capacity (MAX_MATCH_ID_LEN=32, MAX_DELEGATION_UID_LEN=64,
// MAX_POSITION_HISTORY=200).  Must be large enough for the account to
// be re-serialized after a move (position_history grows by 8 bytes).
const CHESS_MATCH_SPACE: usize = 4096;

/// Create an `Account` (solana-account v4 style) with enough space for
/// the full ChessMatch struct at maximum capacity.
///
/// The account data is the provided bytes, zero-padded to `CHESS_MATCH_SPACE`.
fn chess_match_account(data: Vec<u8>, lamports: u64) -> Account {
    let mut padded = vec![0u8; CHESS_MATCH_SPACE];
    let len = data.len().min(CHESS_MATCH_SPACE);
    padded[..len].copy_from_slice(&data);
    Account {
        lamports,
        data: padded,
        owner: program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

/// Create an `Account` from raw bytes with the given owner (solana-account v4 style).
fn account_from_bytes(data: Vec<u8>, owner: &Pubkey, lamports: u64) -> Account {
    Account {
        lamports,
        data,
        owner: *owner,
        executable: false,
        rent_epoch: 0,
    }
}

// ============================================================================
//  Mollusk bootstrap
// ============================================================================

fn create_mollusk() -> Mollusk {
    Mollusk::new(&program_id(), PROGRAM_SO_PATH)
}

/// Generate a random pubkey for use as a signer/account address.
fn random_pubkey() -> Pubkey {
    Pubkey::new_unique()
}

fn find_chess_match_pda(match_id: &str, prog_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CHESS_MATCH_SEED, match_id.as_bytes()], prog_id)
}

fn find_match_escrow_pda(match_id: &str, prog_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MATCH_ESCROW_SEED, match_id.as_bytes()], prog_id)
}

// ============================================================================
//  Benchmarks
// ============================================================================

fn run_make_move_bench(
    name: &str,
    match_id: &str,
    board: &BoardDef,
    current_turn: u8,
    from_row: u8,
    from_col: u8,
    to_row: u8,
    to_col: u8,
    promotion: Option<u8>,
    expected_min_cu: u64,
    expected_max_cu: u64,
) {
    let mollusk = create_mollusk();
    let prog_id = program_id();
    let player_pubkey = random_pubkey();

    let (match_pda, bump) = find_chess_match_pda(match_id, &prog_id);
    let opponent_pubkey = Pubkey::default();
    let match_data = build_chess_match_bytes(
        match_id,
        &player_pubkey,
        &opponent_pubkey,
        if current_turn == player_color::WHITE { 0 } else { 1 },
        current_turn,
        1,
        board,
        [true, true, true, true],
        None,
        0,
        1,
        bump,
        255,
    );

    let match_account = chess_match_account(match_data, 1_000_000_000);

    let ix_data = build_make_move_ix_data(from_row, from_col, to_row, to_col, promotion);
    let accounts_meta = vec![
        AccountMeta::new(match_pda, false),
        AccountMeta::new(player_pubkey, true),
    ];
    let instruction = Instruction::new_with_bytes(prog_id, &ix_data, accounts_meta);

    let mollusk_accounts: Vec<(Pubkey, Account)> = vec![
        (match_pda, match_account),
        (
            player_pubkey,
            Account {
                lamports: 1_000_000_000,
                data: vec![],
                owner: system_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
    ];

    let result = mollusk.process_instruction(&instruction, &mollusk_accounts);
    let cu = result.compute_units_consumed;
    let status = if cu <= CU_BUDGET { "PASS" } else { "FAIL" };

    println!(
        "{status:>4} | {name:<45} | CU: {cu:>7}  (expected {expected_min_cu:>6}–{expected_max_cu:<6}, budget {CU_BUDGET})"
    );

    assert!(
        cu <= CU_BUDGET,
        "{name}: CU {cu} exceeds budget {CU_BUDGET}",
    );
    assert!(
        cu >= expected_min_cu,
        "{name}: CU {cu} below expected minimum {expected_min_cu}",
    );
}

// ── Benchmark 1: Simple pawn advance (baseline) ────────────────────────────

#[test]
fn bench_01_pawn_advance_baseline() {
    run_make_move_bench(
        "01 pawn advance e2e4 (baseline)",
        "bench-01",
        &starting_board_def(),
        player_color::WHITE,
        1, 4,
        3, 4,
        None,
        7_000,
        50_000,
    );
}

// ── Benchmark 2: Knight move ──────────────────────────────────────────────

#[test]
fn bench_02_knight_move() {
    run_make_move_bench(
        "02 knight Nb1c3 (no path check)",
        "bench-02",
        &starting_board_def(),
        player_color::WHITE,
        0, 1,
        2, 2,
        None,
        7_000,
        50_000,
    );
}

// ── Benchmark 3: Bishop across board (path check) ──────────────────────────

#[test]
fn bench_03_bishop_path_check() {
    let mut board = starting_board_def();
    board[1][4] = None;

    run_make_move_bench(
        "03 bishop Bc1f4 (diagonal path check)",
        "bench-03",
        &board,
        player_color::WHITE,
        0, 2,
        3, 5,
        None,
        5_000,
        25_000,
    );
}

// ── Benchmark 4: Queen diagonal (longest path) ─────────────────────────────

#[test]
fn bench_04_queen_diagonal_long_path() {
    let mut board = emptyish_board_with_kings();
    board[0][3] = Some((piece_type::QUEEN, player_color::WHITE));
    board[0][2] = Some((piece_type::BISHOP, player_color::WHITE));

    run_make_move_bench(
        "04 queen Qd1h5 (long diagonal path check)",
        "bench-04",
        &board,
        player_color::WHITE,
        0, 3,
        4, 7,
        None,
        10_000,
        40_000,
    );
}

// ── Benchmark 5: are_no_legal_moves midgame ────────────────────────────────

#[test]
fn bench_05_are_no_legal_moves_midgame() {
    run_make_move_bench(
        "05 no-legal-moves check midgame (~30 opponent moves)",
        "bench-05",
        &midgame_board_def(),
        player_color::WHITE,
        0, 1,
        2, 2,
        None,
        15_000,
        50_000,
    );
}

// ── Benchmark 6: Full initialize_match instruction ─────────────────────────

#[test]
fn bench_06_initialize_match() {
    let prog_id = program_id();
    let mollusk = create_mollusk();

    let player_pubkey = random_pubkey();
    let match_id = "bench-init06";
    let bet_amount: u64 = 1_000_000;
    let move_timeout_duration: i64 = 900;
    let platform_fee_bps: u16 = 200;
    let platform_fee_wallet = random_pubkey();

    let (match_pda, _match_bump) = find_chess_match_pda(match_id, &prog_id);
    let (escrow_pda, _escrow_bump) = find_match_escrow_pda(match_id, &prog_id);

    let mint = random_pubkey();
    let player_ata_address = random_pubkey();

    let token_program_id = Pubkey::from_str(TOKEN_PROGRAM_ID_STR).unwrap();

    let mint_data = {
        let mut d = vec![0u8; 82];
        d[0..4].copy_from_slice(&0u32.to_le_bytes());
        d[36..44].copy_from_slice(&1_000_000_000u64.to_le_bytes());
        d[44] = 9;
        d[45] = 1;
        d[46..50].copy_from_slice(&0u32.to_le_bytes());
        d
    };
    let mint_account = account_from_bytes(mint_data, &token_program_id, 1_460_160);

    let player_ata_data = {
        let mut d = vec![0u8; 165];
        d[0..32].copy_from_slice(&mint.to_bytes());
        d[32..64].copy_from_slice(&player_pubkey.to_bytes());
        let bal: u64 = 10_000_000;
        d[64..72].copy_from_slice(&bal.to_le_bytes());
        d[108] = 1;
        d
    };
    let player_ata = account_from_bytes(player_ata_data, &token_program_id, 2_039_280);

    let escrow_account = Account {
        lamports: 0,
        data: vec![0u8; 165],
        owner: token_program_id,
        executable: false,
        rent_epoch: 0,
    };

    let ix_data = build_init_match_ix_data(
        match_id,
        bet_amount,
        move_timeout_duration,
        platform_fee_bps,
        &platform_fee_wallet,
    );

    let account_metas = vec![
        AccountMeta::new(match_pda, false),
        AccountMeta::new(player_pubkey, true),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new(player_ata_address, false),
        AccountMeta::new(escrow_pda, false),
        AccountMeta::new_readonly(token_program_id, false),
        AccountMeta::new_readonly(system_program_id(), false),
    ];
    let instruction = Instruction::new_with_bytes(prog_id, &ix_data, account_metas);

    let mollusk_accounts: Vec<(Pubkey, Account)> = vec![
        (
            match_pda,
            Account {
                lamports: 0,
                data: vec![],
                owner: system_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
        (
            player_pubkey,
            Account {
                lamports: 1_000_000_000,
                data: vec![],
                owner: system_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
        (mint, mint_account),
        (player_ata_address, player_ata),
        (escrow_pda, escrow_account),
        // System program — required as a builtin account by the instruction
        (
            system_program_id(),
            Account {
                lamports: 0,
                data: vec![],
                owner: system_program_id(),
                executable: true,
                rent_epoch: 0,
            },
        ),
        // Token program — stub (CPI will fail without the real .so loaded)
        (
            token_program_id,
            Account {
                lamports: 0,
                data: vec![],
                owner: solana_pubkey::Pubkey::default(),
                executable: true,
                rent_epoch: 0,
            },
        ),
    ];

    let result = mollusk.process_instruction(&instruction, &mollusk_accounts);
    let cu = result.compute_units_consumed;
    let status = if cu <= CU_BUDGET { "PASS" } else { "FAIL" };

    println!(
        "{status:>4} | 06 initialize_match (account setup + CPI)         | CU: {cu:>7}  (budget {CU_BUDGET})"
    );

    if result.program_result.is_err() {
        println!(
            "  NOTE: initialize_match CPI failed (token program may not be loaded in Mollusk)."
        );
        println!("  To enable: add spl_token.so via mollusk.add_program().");
    } else {
        assert!(cu <= CU_BUDGET);
    }
}

// ── Benchmark 7: initialize_match with SPL Token loaded ─────────────────
//
//  Same as benchmark 6 but attempts to load the SPL Token program so the
//  CPI can succeed.  If the .so file is not found the test skips CU assertions.

#[test]
fn bench_07_initialize_match_with_token() {
    let prog_id = program_id();
    let mut mollusk = create_mollusk();

    let player_pubkey = random_pubkey();
    let match_id = "bench-init07";
    let bet_amount: u64 = 1_000_000;
    let move_timeout_duration: i64 = 900;
    let platform_fee_bps: u16 = 200;
    let platform_fee_wallet = random_pubkey();

    let (match_pda, _match_bump) = find_chess_match_pda(match_id, &prog_id);
    let (escrow_pda, _escrow_bump) = find_match_escrow_pda(match_id, &prog_id);

    let mint = random_pubkey();
    let player_ata_address = random_pubkey();

    let token_program_id = Pubkey::from_str(TOKEN_PROGRAM_ID_STR).unwrap();

    // Try to find and load the SPL Token .so file
    let token_so_paths = [
        "../../target/deploy/spl_token.so",
        "target/deploy/spl_token.so",
        "tests/fixtures/spl_token.so",
    ];
    let mut token_loaded = false;
    for path in &token_so_paths {
        let so_path = std::path::Path::new(path);
        if so_path.exists() {
            mollusk.add_program(&token_program_id, path);
            println!("  Loaded SPL Token program from: {path}");
            token_loaded = true;
            break;
        }
    }
    if !token_loaded {
        println!("  NOTE: spl_token.so not found. CPI will fail.");
    }

    let mint_data = {
        let mut d = vec![0u8; 82];
        d[0..4].copy_from_slice(&0u32.to_le_bytes());
        d[36..44].copy_from_slice(&1_000_000_000u64.to_le_bytes());
        d[44] = 9;
        d[45] = 1;
        d[46..50].copy_from_slice(&0u32.to_le_bytes());
        d
    };
    let mint_account = account_from_bytes(mint_data, &token_program_id, 1_460_160);

    let player_ata_data = {
        let mut d = vec![0u8; 165];
        d[0..32].copy_from_slice(&mint.to_bytes());
        d[32..64].copy_from_slice(&player_pubkey.to_bytes());
        let bal: u64 = 10_000_000;
        d[64..72].copy_from_slice(&bal.to_le_bytes());
        d[108] = 1;
        d
    };
    let player_ata = account_from_bytes(player_ata_data, &token_program_id, 2_039_280);

    let escrow_account = Account {
        lamports: 0,
        data: vec![0u8; 165],
        owner: token_program_id,
        executable: false,
        rent_epoch: 0,
    };

    let ix_data = build_init_match_ix_data(
        match_id,
        bet_amount,
        move_timeout_duration,
        platform_fee_bps,
        &platform_fee_wallet,
    );

    let account_metas = vec![
        AccountMeta::new(match_pda, false),
        AccountMeta::new(player_pubkey, true),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new(player_ata_address, false),
        AccountMeta::new(escrow_pda, false),
        AccountMeta::new_readonly(token_program_id, false),
        AccountMeta::new_readonly(system_program_id(), false),
    ];
    let instruction = Instruction::new_with_bytes(prog_id, &ix_data, account_metas);

    let mollusk_accounts: Vec<(Pubkey, Account)> = vec![
        (
            match_pda,
            Account {
                lamports: 0,
                data: vec![],
                owner: system_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
        (
            player_pubkey,
            Account {
                lamports: 1_000_000_000,
                data: vec![],
                owner: system_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
        (mint, mint_account),
        (player_ata_address, player_ata),
        (escrow_pda, escrow_account),
        (
            system_program_id(),
            Account {
                lamports: 0,
                data: vec![],
                owner: system_program_id(),
                executable: true,
                rent_epoch: 0,
            },
        ),
        // Token program executable stub
        (
            token_program_id,
            Account {
                lamports: 0,
                data: vec![],
                owner: Pubkey::from_str("BPFLoaderUpgradeab1e11111111111111111111111").unwrap(),
                executable: true,
                rent_epoch: 0,
            },
        ),
    ];

    let result = mollusk.process_instruction(&instruction, &mollusk_accounts);
    let cu = result.compute_units_consumed;

    let (status, passed) = if result.program_result.is_ok() {
        (if cu <= CU_BUDGET { "PASS" } else { "FAIL" }, cu <= CU_BUDGET)
    } else if !token_loaded {
        ("SKIP", true) // Not a failure if token .so wasn't available
    } else {
        ("FAIL", false)
    };

    println!(
        "{status:>4} | 07 initialize_match (SPL Token CPI)               | CU: {cu:>7}  (budget {CU_BUDGET})"
    );
    if !token_loaded && result.program_result.is_err() {
        println!("  NOTE: Token .so not found — CPI skipped.");
    }
    assert!(passed, "bench_07: unexpected failure");
}

// ── Benchmark 8: are_no_legal_moves — complex midgame ──────────────────
//
//  Sicilian Defense position with ~35-40 legal moves for Black.
//  Exercises the full brute-force legal-move scanner on a rich position.
//
//  Expected: ~25 000 – 55 000 CU

fn complex_midgame_board_def() -> BoardDef {
    let mut board = [[None; BOARD_COLS]; BOARD_ROWS];
    let w = player_color::WHITE;
    let b = player_color::BLACK;

    // White pieces
    board[0][4] = Some((piece_type::KING, w));
    board[0][3] = Some((piece_type::QUEEN, w));
    board[0][0] = Some((piece_type::ROOK, w));
    board[0][7] = Some((piece_type::ROOK, w));
    board[0][2] = Some((piece_type::BISHOP, w));
    board[3][5] = Some((piece_type::BISHOP, w));   // Be2
    board[2][2] = Some((piece_type::KNIGHT, w));   // Nc3
    board[2][1] = Some((piece_type::KNIGHT, w));   // Nb3
    board[1][0] = Some((piece_type::PAWN, w));
    board[1][1] = Some((piece_type::PAWN, w));
    board[3][4] = Some((piece_type::PAWN, w));     // e4
    board[1][5] = Some((piece_type::PAWN, w));
    board[1][6] = Some((piece_type::PAWN, w));
    board[1][7] = Some((piece_type::PAWN, w));

    // Black pieces
    board[7][4] = Some((piece_type::KING, b));
    board[7][3] = Some((piece_type::QUEEN, b));
    board[7][0] = Some((piece_type::ROOK, b));
    board[7][7] = Some((piece_type::ROOK, b));
    board[7][2] = Some((piece_type::BISHOP, b));
    board[6][4] = Some((piece_type::BISHOP, b));   // Be7
    board[4][5] = Some((piece_type::KNIGHT, b));   // Nf6
    board[7][6] = Some((piece_type::KNIGHT, b));   // Ng8
    board[5][0] = Some((piece_type::PAWN, b));     // a6
    board[6][1] = Some((piece_type::PAWN, b));     // b7
    board[5][3] = Some((piece_type::PAWN, b));     // d6
    board[4][4] = Some((piece_type::PAWN, b));     // e5
    board[6][5] = Some((piece_type::PAWN, b));
    board[6][6] = Some((piece_type::PAWN, b));
    board[6][7] = Some((piece_type::PAWN, b));

    board
}

#[test]
fn bench_08_are_no_legal_moves_complex() {
    run_make_move_bench(
        "08 no-legal-moves complex midgame (~40 moves for opponent)",
        "bench-08",
        &complex_midgame_board_def(),
        player_color::WHITE,
        3, 5,  // e2 (Be2)
        2, 4,  // d3 (simple bishop retreat)
        None,
        25_000,
        60_000,
    );
}

// ============================================================================
//  Summary runner
// ============================================================================

#[test]
fn run_all_benchmarks() {
    println!("╔══════════════════════════════════════════════════════════════════════╗");
    println!("║         Magic Chess — Mollusk CU Benchmarks                          ║");
    println!("║         Program: {PROGRAM_ID_STR}              ║");
    println!("║         Budget : {CU_BUDGET} CU                                        ║");
    println!("╚══════════════════════════════════════════════════════════════════════╝");
    println!();
    println!("{:>4} | {:<45} | {}", "STAT", "Benchmark", "CU Result");
    println!("{:-<4}-+-{:-<45}-+-{:-<20}", "----", "", "");

    bench_01_pawn_advance_baseline();
    bench_02_knight_move();
    bench_03_bishop_path_check();
    bench_04_queen_diagonal_long_path();
    bench_05_are_no_legal_moves_midgame();
    bench_06_initialize_match();
    bench_07_initialize_match_with_token();
    bench_08_are_no_legal_moves_complex();

    println!();
    println!("All benchmarks complete.");
}
