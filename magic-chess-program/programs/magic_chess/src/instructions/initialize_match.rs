// src/instructions/initialize_match.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(
    match_id_arg: String,
    bet_amount_arg: u64,
    move_timeout_duration_arg: i64,
    platform_fee_basis_points_arg: u16,
    platform_fee_wallet_arg: Pubkey,
    prediction_enabled_arg: bool,
)]
pub struct InitializeMatch<'info> {
    #[account(
        init,
        payer = player_signer,
        space = ANCHOR_DISCRIMINATOR + ChessMatch::INIT_SPACE,
        seeds = [CHESS_MATCH_SEED, match_id_arg.as_bytes()],
        bump
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub player_signer: Signer<'info>,

    /// The SPL token mint used for betting — any SPL token is accepted
    pub betting_token_mint_account: Account<'info, Mint>,

    #[account(
        mut,
        constraint = player_token_account.owner == player_signer.key() @ ChessError::InvalidOwner,
        constraint = player_token_account.mint == betting_token_mint_account.key() @ ChessError::InvalidMint
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = player_signer,
        seeds = [MATCH_ESCROW_SEED, match_id_arg.as_bytes()],
        bump,
        token::mint = betting_token_mint_account,
        token::authority = match_escrow_token_account
    )]
    pub match_escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_match(
    ctx: Context<InitializeMatch>,
    match_id_arg: String,
    bet_amount_arg: u64,
    move_timeout_duration_arg: i64,
    platform_fee_basis_points_arg: u16,
    platform_fee_wallet_arg: Pubkey,
    prediction_enabled_arg: bool,
) -> Result<()> {
    let chess_match_account = &mut ctx.accounts.chess_match;
    let player_signer_account = &ctx.accounts.player_signer;
    let clock = Clock::get()?;

    // 1. Validate match_id length
    require!(
        !match_id_arg.is_empty() && match_id_arg.len() <= MAX_MATCH_ID_LEN,
        ChessError::InvalidMatchIdLength
    );

    // 2. Validate bet amount — must be at least 1 token unit (prevents zero-bet spam)
    require!(
        bet_amount_arg >= MIN_BET_AMOUNT,
        ChessError::InvalidBetAmount
    );

    // 3. Validate platform fee basis points
    require!(
        platform_fee_basis_points_arg <= PLATFORM_FEE_MAX_BPS,
        ChessError::InvalidPlatformFee
    );

    // 4. Validate platform_fee_wallet is not zero pubkey
    require!(
        platform_fee_wallet_arg != Pubkey::default(),
        ChessError::InvalidPlatformFeeWallet
    );

    // 5. Validate move_timeout_duration is non-negative
    require!(
        move_timeout_duration_arg >= 0,
        ChessError::InvalidTimeoutDuration
    );

    // 6. Initialize ChessMatch account fields
    let actual_betting_token_mint_key = ctx.accounts.betting_token_mint_account.key();

    chess_match_account.match_id = match_id_arg.clone();
    chess_match_account.players[0] = player_signer_account.key();
    chess_match_account.players[1] = Pubkey::default();
    chess_match_account.current_player_idx = 0;
    chess_match_account.current_turn = PlayerColor::White;

    chess_match_account.last_move_timestamp = clock.unix_timestamp;
    chess_match_account.move_timeout_duration = move_timeout_duration_arg;

    chess_match_account.game_status = GameStatus::WaitingForOpponent;
    chess_match_account.game_end_reason = None;

    chess_match_account.board = chess_logic::initialize_chess_board();
    chess_match_account.castling_rights = CastlingRights::default();
    chess_match_account.en_passant_target = None;

    // Record initial position hash so first occurrence counts for threefold repetition
    let initial_hash = chess_logic::compute_zobrist_hash(
        &chess_match_account.board,
        &chess_match_account.castling_rights,
        chess_match_account.en_passant_target,
        chess_match_account.current_turn,
    );
    chess_logic::push_position_hash(&mut chess_match_account.position_history, initial_hash);

    chess_match_account.halfmove_clock = 0;
    chess_match_account.fullmove_number = 1;

    chess_match_account.betting_token_mint = actual_betting_token_mint_key;
    chess_match_account.bet_amount_player_one = bet_amount_arg;
    chess_match_account.bet_amount_player_two = 0;
    chess_match_account.total_pot = bet_amount_arg;

    chess_match_account.platform_fee_basis_points = platform_fee_basis_points_arg;
    chess_match_account.platform_fee_wallet = platform_fee_wallet_arg;

    chess_match_account.payout_processed = false;
    chess_match_account.prediction_enabled = prediction_enabled_arg;

    chess_match_account.white_session_signer = Pubkey::default();
    chess_match_account.white_session_expires_at = 0;
    chess_match_account.black_session_signer = Pubkey::default();
    chess_match_account.black_session_expires_at = 0;
    chess_match_account.active_task_id = -1;

    chess_match_account.bump = ctx.bumps.chess_match;
    chess_match_account.match_escrow_bump = ctx.bumps.match_escrow_token_account;

    // 5. Transfer the bet from the player to the match escrow
    let cpi_accounts_transfer = Transfer {
        from: ctx.accounts.player_token_account.to_account_info(),
        to: ctx.accounts.match_escrow_token_account.to_account_info(),
        authority: player_signer_account.to_account_info(),
    };
    let cpi_ctx_transfer = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts_transfer);
    token::transfer(cpi_ctx_transfer, bet_amount_arg)?;

    // 6. Emit event
    emit!(MatchCreatedEvent {
        match_id: chess_match_account.match_id.clone(),
        creator: player_signer_account.key(),
        betting_token_mint: chess_match_account.betting_token_mint,
        bet_amount: bet_amount_arg,
        move_timeout_duration: move_timeout_duration_arg,
        platform_fee_basis_points: platform_fee_basis_points_arg,
    });

    msg!("Match created: {}", chess_match_account.match_id);
    Ok(())
}
