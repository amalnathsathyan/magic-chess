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

    // Set delegation fields BEFORE the delegation CPI.
    // The delegate_account_inner flow:
    //   1. Copies chess_match data into a buffer (capturing delegation_uid + is_delegated)
    //   2. Zeros the chess_match data on the base layer
    //   3. Assigns the chess_match PDA to the delegation program
    //   4. CPIs to the delegation program to reconstruct the account on the ER
    // After step 3, our program no longer owns chess_match — writes would fail.
    // The #[delegate] macro with `del` attribute handles the exit serialization
    // by recognizing the ownership transfer and skipping the post-CPI write.
    let chess_match = &mut ctx.accounts.chess_match;
    chess_match.delegation_uid = uid;
    chess_match.is_delegated = true;

    ctx.accounts.delegate_chess_match(
        &ctx.accounts.payer,
        &[CHESS_MATCH_SEED, match_id.as_bytes()],
        DelegateConfig::default(),
    )?;

    Ok(())
}
