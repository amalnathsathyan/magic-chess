// src/instructions/process_match_settlement.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::{ChessMatch, GameStatus};
use crate::utils::payout_logic;

#[derive(Accounts)]
pub struct ProcessMatchSettlement<'info> {
    #[account(
        mut, // Mutable because we set payout_processed = true
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()], // Assuming match_id is String
        bump = chess_match.bump,
        constraint = (
            chess_match.game_status == GameStatus::WhiteWins ||
            chess_match.game_status == GameStatus::BlackWins ||
            chess_match.game_status == GameStatus::Draw
        ) @ ChessError::GameNotConcluded,
        constraint = !chess_match.payout_processed @ ChessError::PayoutAlreadyProcessed,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    // The PDA escrow token account holding the bets.
    // We need both its Account<TokenAccount> for data (like owner) and its AccountInfo for CPI.
    #[account(
        mut,
        seeds = [MATCH_ESCROW_SEED, chess_match.match_id.as_bytes()], // Assuming match_id is String
        bump, // Anchor derives and verifies this bump
    )]
    pub match_escrow_token_account: Box<Account<'info, TokenAccount>>,

    // Player 1's token account (ATA)
    #[account(
        mut,
        constraint = player_one_ata.owner == chess_match.players[0] @ ChessError::PlayerTokenAccountMismatch,
        constraint = player_one_ata.mint == chess_match.betting_token_mint @ ChessError::PlayerTokenAccountMismatch,
    )]
    pub player_one_ata: Box<Account<'info, TokenAccount>>, // Player 1's Associated Token Account

    // Player 2's token account (ATA)
    #[account(
        mut,
        constraint = player_two_ata.owner == chess_match.players[1] @ ChessError::PlayerTokenAccountMismatch,
        constraint = player_two_ata.mint == chess_match.betting_token_mint @ ChessError::PlayerTokenAccountMismatch,
    )]
    pub player_two_ata: Box<Account<'info, TokenAccount>>, // Player 2's Associated Token Account

    // Platform's fee collection account
    #[account(
        mut,
        constraint = platform_fee_ata.mint == chess_match.betting_token_mint @ ChessError::PlatformTokenAccountError,
        constraint = platform_fee_ata.owner == chess_match.platform_fee_wallet @ ChessError::InvalidPlatformFeeWallet,
    )]
    pub platform_fee_ata: Box<Account<'info, TokenAccount>>, // Platform's Associated Token Account

    /// Rent destination for escrow account closure — receives lamports back.
    /// CHECK: this account only receives rent lamports from the closed escrow token account.
    #[account(mut)]
    pub payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    // system_program: Program<'info, System>, // Not directly needed for this instruction
}

pub fn handle_process_match_settlement(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
    // Prevent duplicate mutable accounts (state corruption)
    require!(
        ctx.accounts.player_one_ata.key() != ctx.accounts.player_two_ata.key(),
        ChessError::DuplicateAccounts
    );
    require!(
        ctx.accounts.player_one_ata.key() != ctx.accounts.platform_fee_ata.key(),
        ChessError::DuplicateAccounts
    );
    require!(
        ctx.accounts.player_two_ata.key() != ctx.accounts.platform_fee_ata.key(),
        ChessError::DuplicateAccounts
    );

    // Capture immutable data before mutable borrows
    let total_pot = ctx.accounts.chess_match.total_pot;
    let fee_bps = ctx.accounts.chess_match.platform_fee_basis_points;
    let fee = total_pot
        .checked_mul(fee_bps.into())
        .ok_or(ChessError::MathError)?
        .checked_div(10000)
        .ok_or(ChessError::MathError)?;
    let game_status = ctx.accounts.chess_match.game_status;
    let players = ctx.accounts.chess_match.players;
    let match_id = ctx.accounts.chess_match.match_id.clone();
    let match_escrow_bump = ctx.accounts.chess_match.match_escrow_bump;

    let chess_match = &mut ctx.accounts.chess_match; // Note: mutable reference

    // These are Account<TokenAccount> types from the context
    let match_escrow_data = &ctx.accounts.match_escrow_token_account;
    let player_one_ata_data = &ctx.accounts.player_one_ata;
    let player_two_ata_data = &ctx.accounts.player_two_ata;
    let platform_fee_ata_data = &ctx.accounts.platform_fee_ata;

    // These are AccountInfo types needed for the payout_logic functions
    let match_escrow_info = match_escrow_data.to_account_info();
    let player_one_ata_info = player_one_ata_data.to_account_info();
    let player_two_ata_info = player_two_ata_data.to_account_info();
    let platform_fee_ata_info = platform_fee_ata_data.to_account_info();

    let token_program_info = &ctx.accounts.token_program;
    let current_program_id = ctx.program_id; // program_id is implicitly available via ctx.program_id

    msg!("Processing settlement for match: {}", match_id);
    msg!("Game status: {:?}", game_status);
    msg!("Total pot: {}", total_pot);

    match game_status {
        GameStatus::WhiteWins => {
            msg!("White wins. Payout to player 1: {}", players[0]);
            payout_logic::process_payout(
                chess_match,                     // &Account<'info, ChessMatch>
                &match_escrow_info,              // &AccountInfo<'info>
                &player_one_ata_info,            // &AccountInfo<'info> for winner
                &platform_fee_ata_info,          // &AccountInfo<'info>
                token_program_info,              // &Program<'info, Token>
                current_program_id,              // &Pubkey
                match_escrow_data,               // &Account<'info, TokenAccount> for validation
            )?;

            emit!(PayoutEvent {
                match_id: match_id.clone(),
                winner: players[0],
                amount: total_pot.checked_sub(fee).unwrap_or(0),
                fee,
            });
        }
        GameStatus::BlackWins => {
            msg!("Black wins. Payout to player 2: {}", players[1]);
            if players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }
            payout_logic::process_payout(
                chess_match,
                &match_escrow_info,
                &player_two_ata_info,            // &AccountInfo<'info> for winner
                &platform_fee_ata_info,
                token_program_info,
                current_program_id,
                match_escrow_data,
            )?;

            emit!(PayoutEvent {
                match_id: match_id.clone(),
                winner: players[1],
                amount: total_pot.checked_sub(fee).unwrap_or(0),
                fee,
            });
        }
        GameStatus::Draw => {
            msg!("Game is a draw. Refunding players.");
            if players[1] == Pubkey::default() && players[0] != Pubkey::default() {
                msg!("Draw detected but player 2 is not set. This state is unexpected for a draw payout.");
                return err!(ChessError::InvalidGameStateForPayout);
            }
            if players[0] == Pubkey::default() || players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }

            payout_logic::process_draw_payout(
                chess_match,
                &match_escrow_info,
                &player_one_ata_info,
                &player_two_ata_info,
                &platform_fee_ata_info,
                token_program_info,
                current_program_id,
                match_escrow_data,
            )?;

            let remaining = total_pot.checked_sub(fee).ok_or(ChessError::MathError)?;
            let half = remaining.checked_div(2).ok_or(ChessError::MathError)?;

            emit!(DrawPayoutEvent {
                match_id: match_id.clone(),
                white_player: players[0],
                black_player: players[1],
                amount_each: half,
                fee,
            });
        }
        _ => {
            return err!(ChessError::GameNotConcluded);
        }
    }

    // Mark payout as processed to prevent double payouts
    chess_match.payout_processed = true;

    // Close the escrow token account and return rent to payer
    msg!("Closing escrow token account for match: {}", match_id);
    let escrow_info = match_escrow_info.clone();
    let payer_info = ctx.accounts.payer.to_account_info();

    // Derive PDA signer seeds for the escrow authority
    let match_id_bytes = match_id.as_bytes();
    let escrow_seeds: &[&[u8]] = &[
        MATCH_ESCROW_SEED,
        match_id_bytes,
        &[match_escrow_bump],
    ];
    let escrow_signer_seeds: &[&[&[u8]]] = &[&escrow_seeds[..]];

    token::close_account(
        CpiContext::new_with_signer(
            token_program_info.key(),
            CloseAccount {
                account: escrow_info.clone(),
                destination: payer_info,
                authority: escrow_info.clone(),
            },
            escrow_signer_seeds,
        ),
    )?;

    msg!("Settlement processed successfully for match: {}", match_id);
    Ok(())
}
