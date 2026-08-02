// src/instructions/join_match.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(bet_amount_arg: u64)]
pub struct JoinMatch<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = chess_match.game_status == GameStatus::WaitingForOpponent @ ChessError::MatchAlreadyFullOrActive,
        constraint = chess_match.players[1] == Pubkey::default() @ ChessError::MatchAlreadyFullOrActive,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub player_two_signer: Signer<'info>,

    #[account(
        mut,
        constraint = player_token_account.owner == player_two_signer.key() @ ChessError::InvalidOwner,
        constraint = player_token_account.mint == chess_match.betting_token_mint @ ChessError::InvalidMintForJoin,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [MATCH_ESCROW_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.match_escrow_bump,
    )]
    pub match_escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_join_match(ctx: Context<JoinMatch>, bet_amount_arg: u64) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let player_two = &ctx.accounts.player_two_signer;

    // 1. Verify the joiner is not the creator
    require!(
        chess_match.players[0] != player_two.key(),
        ChessError::CannotJoinOwnMatch
    );

    // 2. Validate bet amount — must match player one's bet
    require!(
        bet_amount_arg == chess_match.bet_amount_player_one,
        ChessError::BetAmountMismatch
    );

    // 3. Perform the token transfer from joining player to the match escrow
    let cpi_accounts_transfer = Transfer {
        from: ctx.accounts.player_token_account.to_account_info(),
        to: ctx.accounts.match_escrow_token_account.to_account_info(),
        authority: player_two.to_account_info(),
    };
    let cpi_context_transfer = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts_transfer);
    token::transfer(cpi_context_transfer, bet_amount_arg)?;

    // 4. Update chess match state
    chess_match.players[1] = player_two.key();
    chess_match.game_status = GameStatus::Active;
    chess_match.bet_amount_player_two = bet_amount_arg;
    chess_match.total_pot = chess_match.bet_amount_player_one
        .checked_add(bet_amount_arg)
        .ok_or(ChessError::MathError)?;

    // When player 2 joins, reset the move timestamp so player 1 gets full time
    chess_match.last_move_timestamp = Clock::get()?.unix_timestamp;

    msg!("Player {} joined match {}. Game is now active.", player_two.key(), chess_match.match_id);

    // 5. Emit PlayerJoinedEvent
    emit!(PlayerJoinedEvent {
        match_id: chess_match.match_id.clone(),
        player_one: chess_match.players[0],
        player_two: chess_match.players[1],
        betting_token_mint: chess_match.betting_token_mint,
        bet_amount_per_player: bet_amount_arg,
    });

    Ok(())
}
