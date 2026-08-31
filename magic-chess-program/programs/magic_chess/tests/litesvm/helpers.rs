// helpers.rs — Shared test utilities for the Magic Chess LiteSVM test suite.
//
// Uses `anchor-litesvm` (v0.4) for a lightweight in-process Solana VM.
// All Solana types (Pubkey, Keypair, Instruction, AccountMeta, Signer)
// are imported from `anchor_litesvm` to avoid type mismatches between
// different solana-pubkey versions in the dependency tree.
//
// Instruction discriminators are the first 8 bytes of sha256("global:<name>").

use anchor_lang::AccountDeserialize;
use anchor_litesvm::{
    AccountMeta, AnchorContext, AnchorLiteSVM, Instruction, Keypair, Pubkey, Signer, TestHelpers,
};
use magic_chess::state::ChessMatch;
use sha2::{Digest, Sha256};

// ── Well-known constants ──────────────────────────────────────────────────

pub const PROGRAM_ID_STR: &str = "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h";
pub const CHESS_MATCH_SEED: &[u8] = b"chess_match";
pub const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";

pub fn program_id() -> Pubkey {
    PROGRAM_ID_STR.parse().expect("Invalid program ID")
}

pub fn token_program_id() -> Pubkey {
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".parse().expect("Invalid token program ID")
}

pub fn system_program_id() -> Pubkey {
    Pubkey::new_from_array([0u8; 32])
}

pub fn ata_program_id() -> Pubkey {
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL".parse().expect("Invalid ATA program ID")
}

pub fn rent_sysvar_id() -> Pubkey {
    "SysvarRent111111111111111111111111111111111".parse().expect("Invalid rent sysvar ID")
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

/// Try to load the SPL Token program .so from standard locations.
pub fn load_token_so() -> Option<Vec<u8>> {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("../../target/deploy/spl_token.so"),
        manifest.join("target/deploy/spl_token.so"),
        manifest.join("tests/fixtures/spl_token.so"),
    ];
    for p in &candidates {
        if p.exists() {
            return std::fs::read(p).ok();
        }
    }
    None
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

// ── Type conversion ───────────────────────────────────────────────────────
// solana-pubkey v3 (program) and v4 (litesvm) are different Rust types.
// Compare via bytes to bridge the gap.

/// Compare pubkey byte slices.
pub fn pk_eq(a: &[u8], b: &[u8]) -> bool {
    a == b
}

// ── TestSvm context ───────────────────────────────────────────────────────

pub struct TestSvm {
    pub ctx: AnchorContext,
}

impl TestSvm {
    pub fn new() -> Self {
        let program_data = load_program_bytes();
        let mut ctx = AnchorLiteSVM::build_with_program(program_id(), &program_data);

        // Try to load SPL Token program for token operations
        if let Some(token_bytes) = load_token_so() {
            let _ = ctx.svm.add_program(token_program_id(), &token_bytes);
        }

        TestSvm { ctx }
    }

    pub fn payer_pubkey(&self) -> Pubkey {
        self.ctx.payer().pubkey()
    }

    pub fn create_funded_account(&mut self, lamports: u64) -> Keypair {
        self.ctx.create_funded_account(lamports).expect("create_funded_account")
    }

    #[allow(dead_code)]
    pub fn airdrop(&mut self, pubkey: &Pubkey, lamports: u64) {
        self.ctx.airdrop(pubkey, lamports).expect("airdrop");
    }

    pub fn create_mint(&mut self, decimals: u8) -> Pubkey {
        // Clone payer via bytes: to_bytes() returns [u8; 64], new_from_array takes [u8; 32]
        let payer_bytes = self.ctx.payer().to_bytes();
        let mut secret = [0u8; 32];
        secret.copy_from_slice(&payer_bytes[..32]);
        let payer_copy = Keypair::new_from_array(secret);
        self.ctx.svm.create_token_mint(&payer_copy, decimals)
            .expect("create_token_mint")
            .pubkey()
    }

    pub fn create_ata(&mut self, mint: &Pubkey, owner: &Pubkey) -> Pubkey {
        // Derive ATA address
        let ata = Pubkey::find_program_address(
            &[&owner.to_bytes(), &token_program_id().to_bytes(), &mint.to_bytes()],
            &ata_program_id(),
        )
        .0;

        // Return existing ATA if already created
        if self.ctx.svm.get_account(&ata).is_some() {
            return ata;
        }

        // Clone payer to avoid borrow conflict: payer_pubkey() borrows self
        // and execute_instruction also needs to borrow self mutably.
        let payer_pk = self.ctx.payer().pubkey();

        // Build the create-ATA instruction manually
        let ix = Instruction {
            program_id: ata_program_id(),
            accounts: vec![
                AccountMeta::new(payer_pk, true),
                AccountMeta::new(ata, false),
                AccountMeta::new_readonly(*owner, false),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new_readonly(system_program_id(), false),
                AccountMeta::new_readonly(token_program_id(), false),
                AccountMeta::new_readonly(rent_sysvar_id(), false),
            ],
            data: vec![],
        };

        // Clone payer to avoid borrow conflict
        let payer_bytes = self.ctx.payer().to_bytes();
        let mut payer_secret = [0u8; 32];
        payer_secret.copy_from_slice(&payer_bytes[..32]);
        let payer_clone = Keypair::new_from_array(payer_secret);
        let result = self.ctx.execute_instruction(ix, &[&payer_clone]).expect("create_ata");
        result.assert_success();
        ata
    }

    pub fn mint_tokens(&mut self, mint: &Pubkey, token_account: &Pubkey, amount: u64) {
        // Clone the payer keypair: to_bytes() returns [u8; 64], new_from_array takes [u8; 32] secret
        let payer_bytes = self.ctx.payer().to_bytes();
        let mut secret = [0u8; 32];
        secret.copy_from_slice(&payer_bytes[..32]);
        let payer_copy = Keypair::new_from_array(secret);
        self.ctx.svm.mint_to(mint, token_account, &payer_copy, amount)
            .expect("mint_to");
    }

    pub fn send_ix(&mut self, ix: Instruction, signers: &[&Keypair]) {
        // Clone payer BEFORE mutable borrow of self.ctx.execute_instruction
        let payer_bytes = self.ctx.payer().to_bytes();
        let mut payer_secret = [0u8; 32];
        payer_secret.copy_from_slice(&payer_bytes[..32]);
        let payer_clone = Keypair::new_from_array(payer_secret);

        // Clone extra signers
        let extra_clones: Vec<Keypair> = signers.iter().map(|kp| {
            let bytes = kp.to_bytes();
            let mut secret = [0u8; 32];
            secret.copy_from_slice(&bytes[..32]);
            Keypair::new_from_array(secret)
        }).collect();

        let all_signers: Vec<&Keypair> = std::iter::once(&payer_clone)
            .chain(extra_clones.iter())
            .collect();

        let result = self.ctx.execute_instruction(ix, &all_signers).expect("execute_instruction");
        result.assert_success();
    }

    pub fn send_ix_expect_err(&mut self, ix: Instruction, signers: &[&Keypair]) -> String {
        // Clone payer BEFORE mutable borrow
        let payer_bytes = self.ctx.payer().to_bytes();
        let mut payer_secret = [0u8; 32];
        payer_secret.copy_from_slice(&payer_bytes[..32]);
        let payer_clone = Keypair::new_from_array(payer_secret);

        let extra_clones: Vec<Keypair> = signers.iter().map(|kp| {
            let bytes = kp.to_bytes();
            let mut secret = [0u8; 32];
            secret.copy_from_slice(&bytes[..32]);
            Keypair::new_from_array(secret)
        }).collect();

        let all_signers: Vec<&Keypair> = std::iter::once(&payer_clone)
            .chain(extra_clones.iter())
            .collect();

        let result = self.ctx.execute_instruction(ix, &all_signers).expect("execute_instruction");
        // Return the error string if failed, or panic if succeeded
        result.error().cloned().unwrap_or_else(|| {
            panic!("Transaction should have failed but succeeded");
        })
    }

    pub fn get_chess_match(&self, pda: &Pubkey) -> ChessMatch {
        self.ctx.get_account::<ChessMatch>(pda)
            .unwrap_or_else(|e| panic!("Failed to read ChessMatch at {}: {}", pda, e))
    }

    pub fn get_token_balance(&self, ata: &Pubkey) -> u64 {
        // LiteSVM provides `get_balance` via the standard API
        // Different litesvm-utils versions may name this differently
        // Fallback: read the raw account and parse the u64 at offset 64
        if let Some(acct) = self.ctx.svm.get_account(ata) {
            if acct.data.len() >= 72 {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(&acct.data[64..72]);
                return u64::from_le_bytes(bytes);
            }
        }
        panic!("Failed to read balance for {}", ata);
    }

    pub fn account_exists(&self, pubkey: &Pubkey) -> bool {
        self.ctx.svm.get_account(pubkey).is_some()
    }
}

// ── Instruction builders ──────────────────────────────────────────────────

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
    prediction_enabled: bool,
) -> Instruction {
    initialize_match_ix_with_rent_payer(
        chess_match_pda,
        player,
        player,
        betting_token_mint,
        player_token_account,
        match_escrow,
        match_id,
        bet_amount,
        move_timeout_duration,
        platform_fee_bps,
        platform_fee_wallet,
        prediction_enabled,
    )
}

pub fn initialize_match_ix_with_rent_payer(
    chess_match_pda: &Pubkey,
    player: &Pubkey,
    rent_payer: &Pubkey,
    betting_token_mint: &Pubkey,
    player_token_account: &Pubkey,
    match_escrow: &Pubkey,
    match_id: &str,
    bet_amount: u64,
    move_timeout_duration: i64,
    platform_fee_bps: u16,
    platform_fee_wallet: &Pubkey,
    prediction_enabled: bool,
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
    data.push(prediction_enabled as u8);

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*player, true),
            AccountMeta::new(*rent_payer, true),
            AccountMeta::new_readonly(*betting_token_mint, false),
            AccountMeta::new(*player_token_account, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new_readonly(token_program_id(), false),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

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
            AccountMeta::new_readonly(token_program_id(), false),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

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
            // Anchor uses the program id as the sentinel for an omitted
            // optional account; this keeps session-key moves account-compatible.
            AccountMeta::new_readonly(program_id(), false),
        ],
        data,
    }
}

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

pub fn process_settlement_ix(
    chess_match_pda: &Pubkey,
    match_escrow: &Pubkey,
    player_one_ata: &Pubkey,
    player_two_ata: &Pubkey,
    platform_fee_ata: &Pubkey,
    payer: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*chess_match_pda, false),
            AccountMeta::new(*match_escrow, false),
            AccountMeta::new(*player_one_ata, false),
            AccountMeta::new(*player_two_ata, false),
            AccountMeta::new(*platform_fee_ata, false),
            AccountMeta::new(*payer, false),
            AccountMeta::new_readonly(token_program_id(), false),
        ],
        data: discriminator("process_match_settlement").to_vec(),
    }
}

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
            AccountMeta::new_readonly(token_program_id(), false),
        ],
        data: discriminator("abort_match").to_vec(),
    }
}

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

// ── Prediction Market PDA helpers ─────────────────────────────────────────

pub fn find_prediction_pool_pda(match_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"prediction_pool", match_id.as_bytes()],
        &program_id(),
    )
}

pub fn find_prediction_pool_vault_pda(prediction_pool: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"prediction_pool_vault", prediction_pool.as_ref()],
        &program_id(),
    )
}

pub fn find_prediction_bet_pda(prediction_pool: &Pubkey, bettor: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"prediction_bet", prediction_pool.as_ref(), bettor.as_ref()],
        &program_id(),
    )
}

// ── Prediction Market instruction builders ─────────────────────────────────

pub fn initialize_prediction_pool_ix(
    chess_match_pda: &Pubkey,
    prediction_pool: &Pubkey,
    prediction_pool_vault: &Pubkey,
    betting_token_mint: &Pubkey,
    payer: &Pubkey,
    platform_fee_bps: u16,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("initialize_prediction_pool"));
    data.extend_from_slice(&platform_fee_bps.to_le_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*chess_match_pda, false),
            AccountMeta::new(*prediction_pool, false),
            AccountMeta::new(*prediction_pool_vault, false),
            AccountMeta::new_readonly(*betting_token_mint, false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(token_program_id(), false),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

pub fn place_prediction_bet_ix(
    chess_match_pda: &Pubkey,
    prediction_pool: &Pubkey,
    prediction_bet: &Pubkey,
    prediction_pool_vault: &Pubkey,
    bettor_token_account: &Pubkey,
    bettor: &Pubkey,
    bet_amount: u64,
    predicted_outcome: u8,
) -> Instruction {
    let mut data = Vec::new();
    data.extend_from_slice(&discriminator("place_prediction_bet"));
    data.extend_from_slice(&bet_amount.to_le_bytes());
    data.push(predicted_outcome);

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*chess_match_pda, false),
            AccountMeta::new(*prediction_pool, false),
            AccountMeta::new(*prediction_bet, false),
            AccountMeta::new(*prediction_pool_vault, false),
            AccountMeta::new(*bettor_token_account, false),
            AccountMeta::new(*bettor, true),
            AccountMeta::new_readonly(token_program_id(), false),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

pub fn settle_prediction_pool_ix(
    chess_match_pda: &Pubkey,
    prediction_pool: &Pubkey,
    prediction_pool_vault: &Pubkey,
    match_winner_ata: &Pubkey,
    match_loser_ata: &Pubkey,
    platform_fee_ata: &Pubkey,
    caller: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*chess_match_pda, false),
            AccountMeta::new(*prediction_pool, false),
            AccountMeta::new(*prediction_pool_vault, false),
            AccountMeta::new(*match_winner_ata, false),
            AccountMeta::new(*match_loser_ata, false),
            AccountMeta::new(*platform_fee_ata, false),
            AccountMeta::new(*caller, false),
            AccountMeta::new_readonly(token_program_id(), false),
        ],
        data: discriminator("settle_prediction_pool").to_vec(),
    }
}

pub fn claim_prediction_winnings_ix(
    chess_match_pda: &Pubkey,
    prediction_pool: &Pubkey,
    prediction_bet: &Pubkey,
    prediction_pool_vault: &Pubkey,
    bettor_token_account: &Pubkey,
    bettor: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*chess_match_pda, false),
            AccountMeta::new(*prediction_pool, false),
            AccountMeta::new(*prediction_bet, false),
            AccountMeta::new(*prediction_pool_vault, false),
            AccountMeta::new(*bettor_token_account, false),
            AccountMeta::new(*bettor, true),
            AccountMeta::new_readonly(token_program_id(), false),
        ],
        data: discriminator("claim_prediction_winnings").to_vec(),
    }
}

pub fn cancel_prediction_bet_ix(
    chess_match_pda: &Pubkey,
    prediction_pool: &Pubkey,
    prediction_bet: &Pubkey,
    prediction_pool_vault: &Pubkey,
    bettor_token_account: &Pubkey,
    bettor: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*chess_match_pda, false),
            AccountMeta::new(*prediction_pool, false),
            AccountMeta::new(*prediction_bet, false),
            AccountMeta::new(*prediction_pool_vault, false),
            AccountMeta::new(*bettor_token_account, false),
            AccountMeta::new(*bettor, true),
            AccountMeta::new_readonly(token_program_id(), false),
        ],
        data: discriminator("cancel_prediction_bet").to_vec(),
    }
}
