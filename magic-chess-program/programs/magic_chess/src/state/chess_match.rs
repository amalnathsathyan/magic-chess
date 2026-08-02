// src/state/chess_match.rs
use crate::constants::*;
use crate::state::*;
use anchor_lang::prelude::*;

pub const MAX_PLAYERS: usize = 2;

#[account]
#[derive(InitSpace, Debug)]
pub struct ChessMatch {
    #[max_len(MAX_MATCH_ID_LEN)]
    pub match_id: String,
    pub players: [Pubkey; MAX_PLAYERS], // players[0] is White, players[1] is Black
    pub current_player_idx: u8,
    pub current_turn: PlayerColor,

    pub last_move_timestamp: i64,
    pub move_timeout_duration: i64,

    pub game_status: GameStatus,
    pub game_end_reason: Option<GameEndReason>,

    pub board: [[Option<Piece>; 8]; 8],
    pub castling_rights: CastlingRights,
    pub en_passant_target: Option<EnPassantSquare>,
    pub halfmove_clock: u8,
    pub fullmove_number: u16,

    #[max_len(MAX_POSITION_HISTORY)]
    pub position_history: Vec<u64>,

    pub betting_token_mint: Pubkey,
    pub bet_amount_player_one: u64,
    pub bet_amount_player_two: u64,
    pub total_pot: u64,
    pub platform_fee_basis_points: u16,
    pub platform_fee_wallet: Pubkey,    // Recipient of platform fees — validated in settlement
    pub payout_processed: bool,

    pub prediction_enabled: bool,  // Gates prediction market features per match

    // ── MagicBlock Ephemeral Rollups ──
    #[max_len(MAX_DELEGATION_UID_LEN)]
    pub delegation_uid: String,       // MagicBlock delegation uid for this match
    pub is_delegated: bool,           // Whether account is currently delegated to ER
    pub session_signer: Pubkey,       // Current session key (if active)
    pub session_expires_at: i64,      // Unix timestamp when session expires
    pub active_task_id: i64,          // Current scheduled crank task ID (-1 = none)

    pub bump: u8,
    pub match_escrow_bump: u8,          // Bump for the escrow token account PDA
}
