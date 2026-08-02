use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::*;
use crate::constants::*;

#[delegate]
#[derive(Accounts)]
#[instruction(uid: String)]
pub struct DelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, del)]
    pub chess_match: Account<'info, ChessMatch>,
}

pub fn handle_delegate_match(ctx: Context<DelegateMatch>, uid: String) -> Result<()> {
    let match_id = ctx.accounts.chess_match.match_id.clone();

    ctx.accounts.delegate_chess_match(
        &ctx.accounts.payer,
        &[CHESS_MATCH_SEED, match_id.as_bytes()],
        DelegateConfig::default(),
    )?;

    let chess_match = &mut ctx.accounts.chess_match;
    chess_match.delegation_uid = uid;
    chess_match.is_delegated = true;

    Ok(())
}
