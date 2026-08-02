// helpers.rs — Shared test utilities for the Magic Chess LiteSVM-style test suite.
//
// Uses solana-program-test (which includes SPL Token + ATA built-in) so that
// token CPIs inside the program just work without needing to load extra .so files.
//
// Instruction discriminators are the first 8 bytes of sha256("global:<name>").

use anchor_lang::AccountDeserialize;
use magic_chess::state::ChessMatch;
use sha2::{Digest, Sha256};
use solana_program_test::{ProgramTest, ProgramTestContext, BanksClient};
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::Keypair,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
    hash::Hash,
};
use spl_associated_token_account as ata;
use spl_token::state::{Account as TokenAccount, Mint};

// ── Well-known constants ──────────────────────────────────────────────────

pub const PROGRAM_ID_STR: &str = "F8MMYzGxdXdtKTkGqUJvDrmTWm8bBb1zyajLT1s5tpMe";
pub const CHESS_MATCH_SEED: &[u8] = b"chess_match";
pub const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";

pub fn program_id() -> Pubkey {
    PROGRAM_ID_STR.parse().unwrap()
}

// ── Program binary loader ─────────────────────────────────────────────────

pub fn load_program_bytes() -> Vec<u8> {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));

    let candidates = [
        manifest.join("../../target/deploy/magic_chess.so"),
        manifest.join("target/deploy/magic_chess.so"),
    ];

    for p in &candidates {
        if p.exists() {
            return std::fs::read(p)
                .unwrap_or_else(|e| panic!("Failed to read {:?}: {}", p, e));
        }
    }

    panic!(
        "Program .so not found. Tried:\n  {:?}\n  {:?}\nRun `anchor build` first.",
        candidates[0], candidates[1]
    );
}

// ── Discriminator helpers ─────────────────────────────────────────────────

pub fn discriminator(name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("global:{name}").as_bytes());
    let result = hasher.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&result[..8]);
    disc
}

// ── PDA helpers ───────────────────────────────────────────────────────────

pub fn find_chess_match_pda(match_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[CHESS_MATCH_SEED, match_id.as_bytes()],
        &program_id(),
    )
}

pub fn find_escrow_pda(match_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[MATCH_ESCROW_SEED, match_id.as_bytes()],
        &program_id(),
    )
}

// ── Keypair helpers ───────────────────────────────────────────────────────

/// Clone a Keypair (solana-sdk does not derive Clone in production).
/// Uses the from_bytes/to_bytes round-trip.
pub fn clone_keypair(k: &Keypair) -> Keypair {
    Keypair::from_bytes(&k.to_bytes()).expect("Keypair clone failed")
}

// ── ProgramTest setup ─────────────────────────────────────────────────────

/// Create a ProgramTest with the Magic Chess program loaded.
/// The returned ProgramTest has no pre-created payer — use
/// `ctx.payer` from `start_with_context()` which is auto-funded with ~100 SOL.
pub fn setup_program_test() -> ProgramTest {
    let pid = program_id();
    let mut pt = ProgramTest::default();

    let program_data = load_program_bytes();
    let min_lamports = Rent::default().minimum_balance(program_data.len());

    pt.add_account(
        pid,
        Account {
            lamports: min_lamports.max(1_000_000_000),
            data: program_data,
            owner: solana_sdk::bpf_loader::id(),
            executable: true,
            rent_epoch: 0,
        },
    );

    pt
}

// ── Token helpers ─────────────────────────────────────────────────────────

pub async fn create_mint(
    banks_client: &mut BanksClient,
    fee_payer: &Keypair,
    mint: &Keypair,
    decimals: u8,
) {
    let rent = banks_client.get_rent().await.unwrap();
    let space = Mint::LEN;
    let lamports = rent.minimum_balance(space);

    let create_ix = system_instruction::create_account(
        &fee_payer.pubkey(),
        &mint.pubkey(),
        lamports,
        space as u64,
        &spl_token::id(),
    );
    let init_ix = spl_token::instruction::initialize_mint(
        &spl_token::id(),
        &mint.pubkey(),
        &fee_payer.pubkey(),
        Some(&fee_payer.pubkey()),
        decimals,
    )
    .unwrap();

    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[create_ix, init_ix],
        Some(&fee_payer.pubkey()),
        &[fee_payer, mint],
        blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}

pub async fn create_ata(
    banks_client: &mut BanksClient,
    fee_payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Pubkey {
    let ata_addr = ata::get_associated_token_address(owner, mint);
    let create_ix = ata::instruction::create_associated_token_account(
        &fee_payer.pubkey(),
        owner,
        mint,
        &spl_token::id(),
    );
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[create_ix],
        Some(&fee_payer.pubkey()),
        &[fee_payer],
        blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
    ata_addr
}

pub async fn mint_tokens(
    banks_client: &mut BanksClient,
    fee_payer: &Keypair,
    mint: &Pubkey,
    ata: &Pubkey,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        mint,
        ata,
        &fee_payer.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&fee_payer.pubkey()),
        &[fee_payer],
        blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}

/// Read the SPL token balance of an ATA.
pub async fn get_token_balance(
    banks_client: &mut BanksClient,
    ata: &Pubkey,
) -> u64 {
    let acct = banks_client
        .get_account(*ata)
        .await
        .unwrap()
        .expect("ATA not found");
    TokenAccount::unpack(&acct.data).unwrap().amount
}

/// Deserialize the on-chain ChessMatch PDA into a Rust struct.
pub async fn get_chess_match(
    banks_client: &mut BanksClient,
    pda: &Pubkey,
) -> ChessMatch {
    let acct = banks_client
        .get_account(*pda)
        .await
        .unwrap()
        .expect("ChessMatch PDA not found");
    ChessMatch::try_deserialize(&mut acct.data.as_slice())
        .expect("Failed to deserialize ChessMatch")
}

// ── Useful helper: fund any keypair with lamports ────────────────────────

pub async fn fund_keypair(
    banks_client: &mut BanksClient,
    fee_payer: &Keypair,
    target: &Keypair,
    lamports: u64,
) {
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let ix = system_instruction::transfer(
        &fee_payer.pubkey(),
        &target.pubkey(),
        lamports,
    );
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&fee_payer.pubkey()),
        &[fee_payer],
        blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}

// ── Instruction builders ──────────────────────────────────────────────────

// === initialize_match ===
// args: String, u64, i64, u16, Pubkey
pub fn initialize_match_ix(
    chess_match_pda: &Pubkey,
    player: &Pubkey,
    betting_token_mint: &Pubkey,
    player_token_account: &Pubkey,
    match_escrow: &Pubkey,
    match_id: &str,
    bet_amount: u64,
    move_timeout_duration: i64,
    platform_fee_bps: u16,
    platform_fee_wallet: &Pubkey,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("initialize_match"));

    let id_bytes = match_id.as_bytes();
    data.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(id_bytes);
    data.extend_from_slice(&bet_amount.to_le_bytes());
    data.extend_from_slice(&move_timeout_duration.to_le_bytes());
    data.extend_from_slice(&platform_fee_bps.to_le_bytes());
    data.extend_from_slice(&platform_fee_wallet.to_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
            AccountMeta::new_readonly(*betting_token_mint, false),
            AccountMeta::new(*player_token_account, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
        ],
        data,
    }
}

// === join_match ===
// args: u64
pub fn join_match_ix(
    chess_match_pda: &Pubkey,
    player_two: &Pubkey,
    player_token_account: &Pubkey,
    match_escrow: &Pubkey,
    bet_amount: u64,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("join_match"));
    data.extend_from_slice(&bet_amount.to_le_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player_two, true),
            AccountMeta::new(*player_token_account, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
        ],
        data,
    }
}

// === make_move ===
// args: from_row, from_col, to_row, to_col, Option<PieceType>
// PieceType: Pawn=0, Knight=1, Bishop=2, Rook=3, Queen=4, King=5
pub fn make_move_ix(
    chess_match_pda: &Pubkey,
    player: &Pubkey,
    from_row: u8,
    from_col: u8,
    to_row: u8,
    to_col: u8,
    promotion: Option<u8>,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("make_move"));
    data.push(from_row);
    data.push(from_col);
    data.push(to_row);
    data.push(to_col);
    match promotion {
        None => data.push(0),
        Some(v) => {
            data.push(1);
            data.push(v);
        }
    }

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
        ],
        data,
    }
}

// === resign_game ===
pub fn resign_game_ix(chess_match_pda: &Pubkey, player: &Pubkey) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
        ],
        data: discriminator("resign_game").to_vec(),
    }
}

// === claim_timeout_win ===
pub fn claim_timeout_win_ix(
    chess_match_pda: &Pubkey,
    claimer: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*claimer, true),
        ],
        data: discriminator("claim_timeout_win").to_vec(),
    }
}

// === process_match_settlement ===
pub fn process_settlement_ix(
    chess_match_pda: &Pubkey,
    match_escrow: &Pubkey,
    player_one_ata: &Pubkey,
    player_two_ata: &Pubkey,
    platform_fee_ata: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new(*player_one_ata, false),
            AccountMeta::new(*player_two_ata, false),
            AccountMeta::new(*platform_fee_ata, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: discriminator("process_match_settlement").to_vec(),
    }
}

// === abort_match ===
pub fn abort_match_ix(
    chess_match_pda: &Pubkey,
    match_escrow: &Pubkey,
    player_token_account: &Pubkey,
    player: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new(*player_token_account, false),
            AccountMeta::new(*player, true),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: discriminator("abort_match").to_vec(),
    }
}

// === close_match ===
pub fn close_match_ix(chess_match_pda: &Pubkey, payer: &Pubkey) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*payer, true),
        ],
        data: discriminator("close_match").to_vec(),
    }
}

// === set_session_key ===
// args: Pubkey, i64
pub fn set_session_key_ix(
    chess_match_pda: &Pubkey,
    player: &Pubkey,
    session_signer: &Pubkey,
    expires_at: i64,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("set_session_key"));
    data.extend_from_slice(&session_signer.to_bytes());
    data.extend_from_slice(&expires_at.to_le_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
        ],
        data,
    }
}

// === revoke_session_key ===
pub fn revoke_session_key_ix(
    chess_match_pda: &Pubkey,
    player: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
        ],
        data: discriminator("revoke_session_key").to_vec(),
    }
}

// ── Convenience: send a single-instruction transaction ──────────────────
//
// `payer` is the fee payer AND is always included as a signer.
// `extra_signers` are additional required signers (e.g. player 2, session key).

pub async fn send_tx(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    ix: Instruction,
    extra_signers: &[&Keypair],
) {
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let mut all_signers: Vec<&Keypair> = vec![payer];
    all_signers.extend_from_slice(extra_signers);

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &all_signers,
        blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}

/// Send a transaction that is *expected* to fail with an Anchor error.
/// Returns the error log string.
pub async fn send_tx_expect_err(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    ix: Instruction,
    extra_signers: &[&Keypair],
) -> String {
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let mut all_signers: Vec<&Keypair> = vec![payer];
    all_signers.extend_from_slice(extra_signers);

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &all_signers,
        blockhash,
    );
    let result = banks_client.process_transaction(tx).await;
    match result {
        Err(e) => format!("{:?}", e),
        Ok(()) => panic!("Transaction should have failed but succeeded"),
    }
}
