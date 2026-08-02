use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};
use crate::state::*;

#[commit]
#[derive(Accounts)]
pub struct UndelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub chess_match: Account<'info, ChessMatch>,
}

pub fn handle_undelegate_match(ctx: Context<UndelegateMatch>) -> Result<()> {
    let chess_match_info = ctx.accounts.chess_match.to_account_info();
    let payer_info = ctx.accounts.payer.to_account_info();
    let magic_ctx = ctx.accounts.magic_context.to_account_info();
    let magic_prog = ctx.accounts.magic_program.to_account_info();

    MagicIntentBundleBuilder::new(payer_info, magic_ctx, magic_prog)
        .commit_and_undelegate(&[chess_match_info])
        .build_and_invoke()?;

    ctx.accounts.chess_match.is_delegated = false;

    Ok(())
}
