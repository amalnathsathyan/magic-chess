// src/instructions/schedule_timeout.rs
use anchor_lang::prelude::*;
use serde::Serialize;

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::*;

/// CPI instruction discriminant for MagicBlockInstruction::ScheduleTask (variant index 0)
const SCHEDULE_TASK_DISCRIMINANT: u32 = 0;
/// CPI instruction discriminant for MagicBlockInstruction::CancelTask
const CANCEL_TASK_DISCRIMINANT: u32 = 1;

/// Args struct matching magicblock-magic-program-api::ScheduleTaskArgs
#[derive(Debug, Clone, Serialize)]
struct ScheduleTaskArgs {
    task_id: i64,
    execution_interval_millis: i64,
    iterations: i64,
}

#[derive(Accounts)]
pub struct ScheduleTimeout<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

pub fn handle_schedule_timeout(ctx: Context<ScheduleTimeout>, task_id: i64) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let timeout_ms = chess_match.move_timeout_duration.checked_mul(1000).unwrap_or(0);

    invoke_schedule_task(
        task_id,
        timeout_ms,
        1, // iterations = 1: fire once
        &ctx.accounts.payer.to_account_info(),
    )?;

    chess_match.active_task_id = task_id;

    msg!(
        "Timeout task {} scheduled for match {}",
        task_id,
        chess_match.match_id
    );
    Ok(())
}

/// Low-level CPI helper to schedule a task on the MagicBlock crank.
/// Can be called from other instruction handlers that don't use the ScheduleTimeout context.
pub fn invoke_schedule_task(
    task_id: i64,
    execution_interval_millis: i64,
    iterations: i64,
    payer_info: &AccountInfo,
) -> Result<()> {
    let ix_data = build_schedule_task_ix_data(task_id, execution_interval_millis, iterations)?;

    let instruction = anchor_lang::solana_program::instruction::Instruction {
        program_id: TASK_SCHEDULER_ID,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(payer_info.key(), true),
        ],
        data: ix_data,
    };

    anchor_lang::solana_program::program::invoke(
        &instruction,
        &[payer_info.clone()],
    )?;

    Ok(())
}

/// Low-level CPI helper to cancel a previously scheduled task.
pub fn invoke_cancel_task(task_id: i64, payer_info: &AccountInfo) -> Result<()> {
    let mut data = CANCEL_TASK_DISCRIMINANT.to_le_bytes().to_vec();
    data.extend_from_slice(&task_id.to_le_bytes());

    let instruction = anchor_lang::solana_program::instruction::Instruction {
        program_id: TASK_SCHEDULER_ID,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(payer_info.key(), true),
        ],
        data,
    };

    anchor_lang::solana_program::program::invoke(
        &instruction,
        &[payer_info.clone()],
    )?;

    Ok(())
}

/// Serialize MagicBlockInstruction::ScheduleTask(ScheduleTaskArgs)
/// Layout: u32_le(variant_index=0) || bincode(ScheduleTaskArgs)
/// bincode(ScheduleTaskArgs) = i64(task_id) || i64(execution_interval_millis) || i64(iterations)
fn build_schedule_task_ix_data(
    task_id: i64,
    execution_interval_millis: i64,
    iterations: i64,
) -> Result<Vec<u8>> {
    let args = ScheduleTaskArgs {
        task_id,
        execution_interval_millis,
        iterations,
    };
    let mut data = SCHEDULE_TASK_DISCRIMINANT.to_le_bytes().to_vec();
    let args_bytes = bincode::serialize(&args)
        .map_err(|_| Error::from(ChessError::MathError))?;
    data.extend(args_bytes);
    Ok(data)
}
