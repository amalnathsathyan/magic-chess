// src/instructions/place_prediction_bet.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::{ChessMatch, GameStatus, PredictionBet, PredictionPool};

#[derive(Accounts)]
#[instruction(bet_amount_arg: u64, predicted_outcome_arg: u8)]
pub struct PlacePredictionBet<'info> {
    /// The ChessMatch — read-only, used for constraints.
    #[account(
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = chess_match.game_status == GameStatus::Active @ ChessError::BettingClosed,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    /// The PredictionPool tracking accumulated bets.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_SEED, chess_match.match_id.as_bytes()],
        bump = prediction_pool.bump,
        constraint = !prediction_pool.settlement_processed @ ChessError::SettlementAlreadyProcessed,
    )]
    pub prediction_pool: Account<'info, PredictionPool>,

    /// PDA per bettor — created once per bettor per pool.
    #[account(
        init,
        payer = bettor,
        space = ANCHOR_DISCRIMINATOR + PredictionBet::INIT_SPACE,
        seeds = [
            PREDICTION_BET_SEED,
            prediction_pool.key().as_ref(),
            bettor.key().as_ref(),
        ],
        bump,
    )]
    pub prediction_bet: Account<'info, PredictionBet>,

    /// Vault token account that receives all spectator bets.
    #[account(
        mut,
        seeds = [PREDICTION_POOL_VAULT_SEED, prediction_pool.key().as_ref()],
        bump,
        constraint = prediction_pool_vault.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub prediction_pool_vault: Box<Account<'info, TokenAccount>>,

    /// The bettor's token account (source of bet funds).
    #[account(
        mut,
        constraint = bettor_token_account.owner == bettor.key() @ ChessError::InvalidOwner,
        constraint = bettor_token_account.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub bettor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_place_prediction_bet(
    ctx: Context<PlacePredictionBet>,
    bet_amount_arg: u64,
    predicted_outcome_arg: u8,
) -> Result<()> {
    let chess_match = &ctx.accounts.chess_match;
    let prediction_pool = &mut ctx.accounts.prediction_pool;
    let prediction_bet = &mut ctx.accounts.prediction_bet;
    let bettor_key = ctx.accounts.bettor.key();

    // ── Security: bettor must NOT be either player ──
    require!(
        bettor_key != chess_match.players[0],
        ChessError::PlayersCannotBet
    );
    require!(
        chess_match.players[1] == Pubkey::default() || bettor_key != chess_match.players[1],
        ChessError::PlayersCannotBet
    );

    // ── Validate outcome ──
    require!(predicted_outcome_arg <= 2, ChessError::InvalidOutcome);

    // ── Validate bet amount ──
    require!(bet_amount_arg >= MIN_BET_AMOUNT, ChessError::InvalidBetAmount);

    // ── Transfer bet from bettor to pool vault ──
    let cpi_accounts = Transfer {
        from: ctx.accounts.bettor_token_account.to_account_info(),
        to: ctx.accounts.prediction_pool_vault.to_account_info(),
        authority: ctx.accounts.bettor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::transfer(cpi_ctx, bet_amount_arg)?;

    // ── Update pool totals ──
    match predicted_outcome_arg {
        0 => {
            prediction_pool.total_bet_on_white = prediction_pool
                .total_bet_on_white
                .checked_add(bet_amount_arg)
                .ok_or(ChessError::MathError)?;
        }
        1 => {
            prediction_pool.total_bet_on_black = prediction_pool
                .total_bet_on_black
                .checked_add(bet_amount_arg)
                .ok_or(ChessError::MathError)?;
        }
        2 => {
            prediction_pool.total_bet_on_draw = prediction_pool
                .total_bet_on_draw
                .checked_add(bet_amount_arg)
                .ok_or(ChessError::MathError)?;
        }
        _ => return err!(ChessError::InvalidOutcome),
    }

    // ── Initialize PredictionBet PDA ──
    prediction_bet.bettor = bettor_key;
    prediction_bet.pool = prediction_pool.key();
    prediction_bet.amount = bet_amount_arg;
    prediction_bet.predicted_outcome = predicted_outcome_arg;
    prediction_bet.claimed = false;
    prediction_bet.bump = ctx.bumps.prediction_bet;

    msg!(
        "Prediction bet placed: bettor={}, amount={}, outcome={}",
        bettor_key,
        bet_amount_arg,
        predicted_outcome_arg,
    );
    Ok(())
}
