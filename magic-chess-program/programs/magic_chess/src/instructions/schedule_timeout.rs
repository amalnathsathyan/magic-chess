// src/instructions/schedule_timeout.rs
use anchor_lang::prelude::*;
use serde::Serialize;

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::*;

/// CPI instruction discriminant for MagicBlockInstruction::ScheduleTask (variant index 0)
#[allow(dead_code)]
const SCHEDULE_TASK_DISCRIMINANT: u32 = 0;
/// CPI instruction discriminant for MagicBlockInstruction::CancelTask
#[allow(dead_code)]
const CANCEL_TASK_DISCRIMINANT: u32 = 1;

/// Args struct matching magicblock-magic-program-api::ScheduleTaskArgs
/// The `instructions` field contains pre-serialized instructions for the
/// crank to execute when the task fires. Empty = no-op (timeout handling
/// is done directly in make_move via the timeout check on next move).
/// Currently unused — preserved for when Task Scheduler CPI is re-enabled.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
struct ScheduleTaskArgs {
    task_id: i64,
    execution_interval_millis: i64,
    iterations: i64,
    /// Bincode-serialized instructions to execute on task fire.
    /// Pass an empty vec for no-op tasks.
    instructions: Vec<Vec<u8>>,
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
///
/// NOTE: Task Scheduler CPI is currently disabled. The manual timeout check in
/// make_move (lines 69-87) already enforces timeouts on every move attempt.
/// Auto-claim via crank can be re-enabled when the Task Scheduler program
/// (Magic11111111111111111111111111111111111111) is confirmed available on
/// the target runtime.
///
/// To re-enable: uncomment the CPI block below and remove this early return.
pub fn invoke_schedule_task(
    task_id: i64,
    execution_interval_millis: i64,
    _iterations: i64,
    _payer_info: &AccountInfo,
) -> Result<()> {
    msg!(
        "Task Scheduler CPI disabled. Task {} (interval {}ms) not scheduled. \
         Manual timeout enforcement active.",
        task_id, execution_interval_millis
    );
    Ok(())

    // ── Re-enable when Task Scheduler is available ──
    // let ix_data = build_schedule_task_ix_data(task_id, execution_interval_millis, iterations, vec![])?;
    // let instruction = anchor_lang::solana_program::instruction::Instruction {
    //     program_id: TASK_SCHEDULER_ID,
    //     accounts: vec![AccountMeta::new(payer_info.key(), true)],
    //     data: ix_data,
    // };
    // anchor_lang::solana_program::program::invoke(&instruction, &[payer_info.clone()])?;
    // Ok(())
}

/// Low-level CPI helper to cancel a previously scheduled task.
/// Currently disabled — matches invoke_schedule_task behavior.
/// Re-enable together with invoke_schedule_task when Task Scheduler is available.
pub fn invoke_cancel_task(task_id: i64, _payer_info: &AccountInfo) -> Result<()> {
    msg!("Task Scheduler CPI cancel disabled for task {}.", task_id);
    Ok(())

    // ── Re-enable when Task Scheduler is available ──
    // let mut data = CANCEL_TASK_DISCRIMINANT.to_le_bytes().to_vec();
    // data.extend_from_slice(&task_id.to_le_bytes());
    // let instruction = anchor_lang::solana_program::instruction::Instruction {
    //     program_id: TASK_SCHEDULER_ID,
    //     accounts: vec![AccountMeta::new(payer_info.key(), true)],
    //     data,
    // };
    // anchor_lang::solana_program::program::invoke(&instruction, &[payer_info.clone()])?;
    // Ok(())
}

/// Serialize MagicBlockInstruction::ScheduleTask(ScheduleTaskArgs)
/// Layout: u32_le(variant_index=0) || bincode(ScheduleTaskArgs)
/// bincode = i64(task_id) || i64(interval_ms) || i64(iterations) || Vec<Vec<u8>>(instructions)
#[allow(dead_code)]
fn build_schedule_task_ix_data(
    task_id: i64,
    execution_interval_millis: i64,
    iterations: i64,
    instructions: Vec<Vec<u8>>,
) -> Result<Vec<u8>> {
    let args = ScheduleTaskArgs {
        task_id,
        execution_interval_millis,
        iterations,
        instructions,
    };
    let mut data = SCHEDULE_TASK_DISCRIMINANT.to_le_bytes().to_vec();
    let args_bytes = bincode::serialize(&args)
        .map_err(|_| Error::from(ChessError::MathError))?;
    data.extend(args_bytes);
    Ok(data)
}
