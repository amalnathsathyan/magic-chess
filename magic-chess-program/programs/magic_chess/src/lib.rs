// src/lib.rs
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

// Module declarations
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;



declare_id!("5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6");

#[ephemeral]
#[program]
pub mod speed_chess {
    use super::*; // Brings in InitializeMatch, JoinMatch, MakeMove, ResignGame, ClaimTimeoutWin, ProcessMatchSettlement, MakeMoveArgs from instructions::*

    // Initialize a new chess match with betting enabled
    pub fn initialize_match(
        ctx: Context<InitializeMatch>,
        match_id_arg: String,
        bet_amount_arg: u64,
        move_timeout_duration_arg: i64,
        platform_fee_basis_points_arg: u16,
        platform_fee_wallet_arg: Pubkey,
        prediction_enabled_arg: bool,
    ) -> Result<()> {
        instructions::initialize_match::handle_initialize_match(
            ctx,
            match_id_arg,
            bet_amount_arg,
            move_timeout_duration_arg,
            platform_fee_basis_points_arg,
            platform_fee_wallet_arg,
            prediction_enabled_arg,
        )
    }

    // Allow a player to join an existing match
    pub fn join_match(
        ctx: Context<JoinMatch>,
        bet_amount_arg: u64,       // Changed from bet_amount
    ) -> Result<()> {
        instructions::join_match::handle_join_match(ctx, bet_amount_arg)
    }

    // Make a chess move
    // The MakeMoveArgs struct should be defined in make_move.rs and made public,
    // then re-exported by src/instructions/mod.rs to be usable here via instructions::*
    pub fn make_move(
        ctx: Context<MakeMove>,
        args: MakeMoveArgs, // Using the args struct
    ) -> Result<()> {
        instructions::make_move::handle_make_move(ctx, args)
    }

    // Resign from the game, opponent wins
    pub fn resign_game(ctx: Context<ResignGame>) -> Result<()> {
        instructions::resign_game::handle_resign_game(ctx)
    }

    // Claim win due to opponent timeout
    pub fn claim_timeout_win(ctx: Context<ClaimTimeoutWin>) -> Result<()> {
        instructions::claim_timeout_win::handle_claim_timeout_win(ctx)
    }

    // Process the settlement of a concluded match (payouts/refunds)
    pub fn process_match_settlement(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
        instructions::process_match_settlement::handle_process_match_settlement(ctx)
    }

    // Delegate a chess match account to MagicBlock Ephemeral Rollups
    pub fn delegate_match(ctx: Context<DelegateMatch>, uid: String) -> Result<()> {
        instructions::delegate_match::handle_delegate_match(ctx, uid)
    }

    // Commit state from Ephemeral Rollup back to base layer
    pub fn commit_state(ctx: Context<CommitState>) -> Result<()> {
        instructions::commit_state::handle_commit_state(ctx)
    }

    // Undelegate a chess match account from Ephemeral Rollups
    pub fn undelegate_match(ctx: Context<UndelegateMatch>) -> Result<()> {
        instructions::undelegate_match::handle_undelegate_match(ctx)
    }

    // Schedule a crank task to auto-claim timeout after a move
    pub fn schedule_timeout(ctx: Context<ScheduleTimeout>, task_id: i64) -> Result<()> {
        instructions::schedule_timeout::handle_schedule_timeout(ctx, task_id)
    }

    // Cancel a previously scheduled timeout crank task
    pub fn cancel_timeout_task(ctx: Context<CancelTimeoutTask>) -> Result<()> {
        instructions::cancel_timeout_task::handle_cancel_timeout_task(ctx)
    }

    // Set a session key for gasless move signing on MagicBlock ER
    pub fn set_session_key(ctx: Context<SetSessionKey>, session_signer: Pubkey, expires_at: i64) -> Result<()> {
        instructions::set_session_key::handle_set_session_key(ctx, session_signer, expires_at)
    }

    // Revoke the active session key for this match
    pub fn revoke_session_key(ctx: Context<RevokeSessionKey>) -> Result<()> {
        instructions::revoke_session_key::handle_revoke_session_key(ctx)
    }

    // Abort a match that is still waiting for an opponent (creator only)
    pub fn abort_match(ctx: Context<AbortMatch>) -> Result<()> {
        instructions::abort_match::handle_abort_match(ctx)
    }

    // Close a chess_match PDA after settlement, returning rent to the caller
    pub fn close_match(ctx: Context<CloseMatch>) -> Result<()> {
        instructions::close_match::handle_close_match(ctx)
    }

    // ── Prediction Market ──

    // Initialize a prediction pool for a match (only if prediction_enabled)
    pub fn initialize_prediction_pool(
        ctx: Context<InitializePredictionPool>,
        platform_fee_bps_arg: u16,
    ) -> Result<()> {
        instructions::initialize_prediction_pool::handle_initialize_prediction_pool(
            ctx,
            platform_fee_bps_arg,
        )
    }

    // Place a prediction bet on White (0), Black (1), or Draw (2)
    pub fn place_prediction_bet(
        ctx: Context<PlacePredictionBet>,
        bet_amount_arg: u64,
        predicted_outcome_arg: u8,
    ) -> Result<()> {
        instructions::place_prediction_bet::handle_place_prediction_bet(
            ctx,
            bet_amount_arg,
            predicted_outcome_arg,
        )
    }

    // Settle the prediction pool after the match concludes (permissionless)
    pub fn settle_prediction_pool(ctx: Context<SettlePredictionPool>) -> Result<()> {
        instructions::settle_prediction_pool::handle_settle_prediction_pool(ctx)
    }

    // Claim winnings from a settled prediction pool
    pub fn claim_prediction_winnings(ctx: Context<ClaimPredictionWinnings>) -> Result<()> {
        instructions::claim_prediction_winnings::handle_claim_prediction_winnings(ctx)
    }

    // Cancel a prediction bet and get a refund (only if match is WaitingForOpponent or Aborted)
    pub fn cancel_prediction_bet(ctx: Context<CancelPredictionBet>) -> Result<()> {
        instructions::cancel_prediction_bet::handle_cancel_prediction_bet(ctx)
    }
}
