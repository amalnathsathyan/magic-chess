// src/lib.rs
use anchor_lang::prelude::*;

// Module declarations
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;



declare_id!("4f7VH9vbhNnwBSeby9wKLjtbu8vM8RhUX2KVcE9havUB");

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
        instructions::initialize_match::handler(
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
        instructions::join_match::handler(ctx, bet_amount_arg)
    }

    // Make a chess move
    // The MakeMoveArgs struct should be defined in make_move.rs and made public,
    // then re-exported by src/instructions/mod.rs to be usable here via instructions::*
    pub fn make_move(
        ctx: Context<MakeMove>,
        args: MakeMoveArgs, // Using the args struct
    ) -> Result<()> {
        instructions::make_move::handler(ctx, args)
    }

    // Resign from the game, opponent wins
    pub fn resign_game(ctx: Context<ResignGame>) -> Result<()> {
        instructions::resign_game::handler(ctx)
    }

    // Claim win due to opponent timeout
    pub fn claim_timeout_win(ctx: Context<ClaimTimeoutWin>) -> Result<()> {
        instructions::claim_timeout_win::handler(ctx)
    }

    // Process the settlement of a concluded match (payouts/refunds)
    pub fn process_match_settlement(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
        instructions::process_match_settlement::handler(ctx)
    }
}
