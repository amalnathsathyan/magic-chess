// src/instructions/cancel_timeout_task.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::instructions::schedule_timeout;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelTimeoutTask<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

pub fn handle_cancel_timeout_task(ctx: Context<CancelTimeoutTask>) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;

    // Only cancel if there is an active task
    if chess_match.active_task_id < 0 {
        msg!(
            "No active task to cancel for match {}",
            chess_match.match_id
        );
        return Ok(());
    }

    let task_id = chess_match.active_task_id;

    schedule_timeout::invoke_cancel_task(task_id, &ctx.accounts.payer.to_account_info())?;

    chess_match.active_task_id = -1;

    msg!(
        "Timeout task {} cancelled for match {}",
        task_id,
        chess_match.match_id
    );
    Ok(())
}
