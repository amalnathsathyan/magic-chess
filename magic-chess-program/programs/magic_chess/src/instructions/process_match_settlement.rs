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
        seeds = [MATCH_ESCROW_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.match_escrow_bump,
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

    /// Receives the escrow account's rent when it closes. Settlement is
    /// permissionless, so the destination is pinned to a player or the
    /// platform wallet; otherwise whoever settled first could name anyone.
    /// CHECK: only receives lamports; the constraint pins who it can be.
    #[account(
        mut,
        constraint = (
            payer.key() == chess_match.players[0] ||
            payer.key() == chess_match.players[1] ||
            payer.key() == PLATFORM_FEE_WALLET
        ) @ ChessError::InvalidRentRecipient,
    )]
    pub payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    // system_program: Program<'info, System>, // Not directly needed for this instruction
}

pub fn handle_process_match_settlement(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
    // A player who is also the platform wallet could pass one account twice.
    let p1 = ctx.accounts.player_one_ata.key();
    let p2 = ctx.accounts.player_two_ata.key();
    let platform = ctx.accounts.platform_fee_ata.key();
    require!(p1 != p2 && p1 != platform && p2 != platform, ChessError::DuplicateAccounts);

    let total_pot = ctx.accounts.chess_match.total_pot;
    let fee = payout_logic::compute_fee(total_pot, ctx.accounts.chess_match.platform_fee_basis_points)?;
    let game_status = ctx.accounts.chess_match.game_status;
    let players = ctx.accounts.chess_match.players;
    let match_id = ctx.accounts.chess_match.match_id.clone();

    let escrow_info = ctx.accounts.match_escrow_token_account.to_account_info();
    let player_one_info = ctx.accounts.player_one_ata.to_account_info();
    let player_two_info = ctx.accounts.player_two_ata.to_account_info();
    let platform_info = ctx.accounts.platform_fee_ata.to_account_info();
    let token_program = &ctx.accounts.token_program;

    match game_status {
        GameStatus::WhiteWins => {
            payout_logic::process_payout(
                &ctx.accounts.chess_match,
                &escrow_info,
                &player_one_info,
                &platform_info,
                token_program,
            )?;
            emit!(PayoutEvent {
                match_id: match_id.clone(),
                winner: players[0],
                amount: total_pot.saturating_sub(fee),
                fee,
            });
        }
        GameStatus::BlackWins => {
            if players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }
            payout_logic::process_payout(
                &ctx.accounts.chess_match,
                &escrow_info,
                &player_two_info,
                &platform_info,
                token_program,
            )?;
            emit!(PayoutEvent {
                match_id: match_id.clone(),
                winner: players[1],
                amount: total_pot.saturating_sub(fee),
                fee,
            });
        }
        GameStatus::Draw => {
            if players[0] == Pubkey::default() || players[1] == Pubkey::default() {
                return err!(ChessError::InvalidGameStateForPayout);
            }
            payout_logic::process_draw_payout(
                &ctx.accounts.chess_match,
                &escrow_info,
                &player_one_info,
                &player_two_info,
                &platform_info,
                token_program,
            )?;
            let remaining = total_pot.checked_sub(fee).ok_or(ChessError::MathError)?;
            emit!(DrawPayoutEvent {
                match_id: match_id.clone(),
                white_player: players[0],
                black_player: players[1],
                amount_each: remaining / 2,
                fee,
            });
        }
        _ => return err!(ChessError::GameNotConcluded),
    }

    // Mark payout as processed to prevent double payouts
    ctx.accounts.chess_match.payout_processed = true;

    // Anyone can send tokens to the escrow address, and SPL Token refuses to
    // close a non-native account that still holds any. Whatever is left after
    // the payouts (a donation, or griefing to lock the pot) goes to the
    // platform account so the close below can't be blocked.
    ctx.accounts.match_escrow_token_account.reload()?;
    let leftover = ctx.accounts.match_escrow_token_account.amount;
    payout_logic::transfer_from_escrow(
        &ctx.accounts.chess_match,
        &escrow_info,
        &platform_info,
        token_program,
        leftover,
    )?;

    // Close the escrow token account and return its rent to `payer`.
    let bump = [ctx.accounts.chess_match.match_escrow_bump];
    let escrow_seeds: &[&[u8]] = &[MATCH_ESCROW_SEED, match_id.as_bytes(), &bump];
    token::close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: escrow_info.clone(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: escrow_info.clone(),
        },
        &[escrow_seeds],
    ))?;

    Ok(())
}
