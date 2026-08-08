use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

#[commit]
#[derive(Accounts)]
pub struct UndelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub chess_match: Account<'info, ChessMatch>,
}

pub fn handle_undelegate_match(ctx: Context<UndelegateMatch>) -> Result<()> {
    // Authorization: only match players can undelegate
    let payer = ctx.accounts.payer.key();
    let players = ctx.accounts.chess_match.players;
    require!(
        payer == players[0] || payer == players[1],
        crate::errors::ChessError::UnauthorizedSigner
    );

    // The commit CPI reads account bytes immediately. Persist the lifecycle
    // flag before scheduling commit-and-undelegate so the base-layer snapshot
    // cannot retain a stale `is_delegated = true` value.
    ctx.accounts.chess_match.is_delegated = false;
    ctx.accounts.chess_match.exit(ctx.program_id)?;

    let chess_match_info = ctx.accounts.chess_match.to_account_info();
    let payer_info = ctx.accounts.payer.to_account_info();
    let magic_ctx = ctx.accounts.magic_context.to_account_info();
    let magic_prog = ctx.accounts.magic_program.to_account_info();

    MagicIntentBundleBuilder::new(payer_info, magic_ctx, magic_prog)
        .commit_and_undelegate(&[chess_match_info])
        .build_and_invoke()?;

    Ok(())
}
