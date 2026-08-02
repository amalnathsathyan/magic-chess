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

#[cfg(test)]
#[path = "unit_chess.rs"]
mod chess_unit_tests;

use instructions::*;



declare_id!("F8MMYzGxdXdtKTkGqUJvDrmTWm8bBb1zyajLT1s5tpMe");

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
    ) -> Result<()> {
        instructions::initialize_match::handle_initialize_match(
            ctx,
            match_id_arg,
            bet_amount_arg,
            move_timeout_duration_arg,
            platform_fee_basis_points_arg,
            platform_fee_wallet_arg,
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
}
