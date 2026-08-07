use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use anchor_lang::AccountSerialize;
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
    // Read match_id from the account data for PDA seed derivation,
    // and set delegation_uid + is_delegated before the CPI.
    // We must write these fields BEFORE delegating because after the CPI
    // the account is owned by the delegation program.
    let match_id = {
        let mut data = ctx.accounts.chess_match.try_borrow_mut_data()?;

        // Deserialize the current chess match state
        let mut chess_match: ChessMatch =
            ChessMatch::try_deserialize(&mut &data[..])
                .map_err(|_| error!(crate::errors::ChessError::InvalidMatchId))?;

        let match_id = chess_match.match_id.clone();

        // Authorization: only match players can delegate
        let payer = ctx.accounts.payer.key();
        require!(
            payer == chess_match.players[0] || payer == chess_match.players[1],
            crate::errors::ChessError::UnauthorizedSigner
        );

        // Mark the account as delegated before the CPI transfers ownership.
        // delegation_uid uses a deterministic prefix so it can be looked up.
        chess_match.is_delegated = true;
        chess_match.delegation_uid = format!("chess-{}", match_id);

        // Serialize the updated state back into the account data buffer.
        // AccountSerialize::try_serialize writes discriminator + data.
        let mut cursor: &mut [u8] = &mut data;
        chess_match.try_serialize(&mut cursor)
            .map_err(|_| error!(crate::errors::ChessError::InvalidMatchId))?;

        match_id
    }; // data RefMut is dropped here — safe before the CPI

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
