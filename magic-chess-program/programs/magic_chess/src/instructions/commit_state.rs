use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};
use crate::state::*;

#[commit]
#[derive(Accounts)]
pub struct CommitState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub chess_match: Account<'info, ChessMatch>,
}

pub fn handle_commit_state(ctx: Context<CommitState>) -> Result<()> {
    // Authorization: only match players can commit state
    let payer = ctx.accounts.payer.key();
    let players = ctx.accounts.chess_match.players;
    require!(
        payer == players[0] || payer == players[1],
        crate::errors::ChessError::UnauthorizedSigner
    );

    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit(&[ctx.accounts.chess_match.to_account_info()])
    .build_and_invoke()?;

    Ok(())
}
