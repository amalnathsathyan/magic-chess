// src/constants.rs — Single source of truth for all magic numbers and seeds

use anchor_lang::prelude::pubkey;
use anchor_lang::prelude::Pubkey;

// ── Validation Limits ──
pub const MAX_MATCH_ID_LEN: usize = 32;
pub const MAX_DELEGATION_UID_LEN: usize = 64;
pub const MAX_POSITION_HISTORY: usize = 200;
pub const MIN_BET_AMOUNT: u64 = 1;
pub const PLATFORM_FEE_MAX_BPS: u16 = 10_000;
pub const PLATFORM_FEE_DEFAULT_BPS: u16 = 200;

// ── PDA Seeds ──
pub const CHESS_MATCH_SEED: &[u8] = b"chess_match";
pub const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";

// ── Game Defaults ──
pub const DEFAULT_MOVE_TIMEOUT_RAPID: i64 = 900;
pub const DEFAULT_MOVE_TIMEOUT_BLITZ: i64 = 180;

// ── Account Space ──
pub const ANCHOR_DISCRIMINATOR: usize = 8;

// ── MagicBlock Program Addresses ──
pub const DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
pub const TASK_SCHEDULER_ID: Pubkey =
    pubkey!("Magic11111111111111111111111111111111111111");
