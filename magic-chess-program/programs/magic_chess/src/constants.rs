// src/constants.rs — Single source of truth for all magic numbers and seeds

use anchor_lang::prelude::pubkey;
use anchor_lang::prelude::Pubkey;

// ── Validation Limits ──
pub const MAX_MATCH_ID_LEN: usize = 32;
pub const MAX_DELEGATION_UID_LEN: usize = 64;
pub const MAX_POSITION_HISTORY: usize = 200;
/// Zero is a valid wager and represents a free match. The selected mint is
/// still recorded so every client derives the display state from the match
/// account instead of a separate off-chain "free" flag.
pub const MIN_BET_AMOUNT: u64 = 0;
pub const PLATFORM_FEE_MAX_BPS: u16 = 10_000;
pub const PLATFORM_FEE_DEFAULT_BPS: u16 = 200;
/// Hard cap on the match fee (10%). The creator passes the fee, so without a
/// cap a hand-built `initialize_match` could route the whole pot to the fee
/// wallet no matter who wins.
pub const MATCH_PLATFORM_FEE_MAX_BPS: u16 = 1_000;
/// The only wallet a match may name as its fee recipient. The creator chooses
/// it at `initialize_match`, so pinning it keeps a hand-built match from
/// paying the "fee" to the creator. Change it together with
/// `NEXT_PUBLIC_PLATFORM_FEE_WALLET` in the frontend.
pub const PLATFORM_FEE_WALLET: Pubkey = pubkey!("ByBqw1sTTPjWQx6DEAvwT4srVyr4wUdf1R4V4wGoh8j6");

// ── Prediction Pool Fee Split (basis points of losing pool) ──
pub const PREDICTION_WINNERS_SHARE_BPS: u16 = 7_500; // 75% → correct predictors
pub const PREDICTION_MATCH_WINNER_SHARE_BPS: u16 = 1_000; // 10% → match winner
pub const PREDICTION_MATCH_LOSER_SHARE_BPS: u16 = 500; //  5% → match loser
pub const PREDICTION_PLATFORM_SHARE_BPS: u16 = 1_000; // 10% → platform wallet

// ── PDA Seeds ──
pub const CHESS_MATCH_SEED: &[u8] = b"chess_match";
pub const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";
pub const PREDICTION_POOL_SEED: &[u8] = b"prediction_pool";
pub const PREDICTION_POOL_VAULT_SEED: &[u8] = b"prediction_pool_vault";
pub const PREDICTION_BET_SEED: &[u8] = b"prediction_bet";

// ── Session Keys ──
pub const MAX_SESSION_KEY_TTL: i64 = 7 * 24 * 60 * 60; // 7 days

// ── Move clock ──
/// Every match has a per-move clock, so an opponent who walks away can
/// always be timed out and the stake never stays locked. 30 seconds is the
/// floor (the app offers 1, 3 and 10 minutes); 7 days is the ceiling.
pub const MIN_MOVE_TIMEOUT_SECONDS: i64 = 30;
pub const MAX_MOVE_TIMEOUT_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const DEFAULT_MOVE_TIMEOUT_RAPID: i64 = 900;
pub const DEFAULT_MOVE_TIMEOUT_BLITZ: i64 = 180;

// ── Account Space ──
pub const ANCHOR_DISCRIMINATOR: usize = 8;

// ── MagicBlock Program Addresses ──
pub const DELEGATION_PROGRAM_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
