use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::*;
use crate::constants::*;

#[delegate]
#[derive(Accounts)]
pub struct DelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: After delegation CPI, ownership transfers to the delegation
    /// program. UncheckedAccount with `del` avoids Anchor exit serialization
    /// on an account we no longer own (per MagicBlock delegation docs).
    #[account(mut, del)]
    pub chess_match: UncheckedAccount<'info>,
}

pub fn handle_delegate_match(ctx: Context<DelegateMatch>) -> Result<()> {
    // Read match_id from the account data for PDA seed derivation.
    // The ChessMatch account must already have delegation_uid and
    // is_delegated set (done by the caller before calling delegate_match).
    let match_id = {
        let data = ctx.accounts.chess_match.try_borrow_data()?;
        let data_slice: &[u8] = &data;
        let chess_match: ChessMatch = ChessMatch::try_deserialize(&mut &data_slice[..])
            .map_err(|_| error!(crate::errors::ChessError::InvalidMatchId))?;
        chess_match.match_id.clone()
    };

    // Delegate the account to the MagicBlock Ephemeral Rollup.
    // After this CPI, the chess_match PDA is owned by DELEGGvXp...
    // and managed on the ER. Our program no longer owns it on base layer.
    ctx.accounts.delegate_chess_match(
        &ctx.accounts.payer,
        &[CHESS_MATCH_SEED, match_id.as_bytes()],
        DelegateConfig::default(),
    )?;

    Ok(())
}
