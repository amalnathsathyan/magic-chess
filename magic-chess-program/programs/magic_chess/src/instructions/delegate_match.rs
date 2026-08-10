use crate::constants::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use anchor_lang::AccountSerialize;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegateMatch<'info> {
    /// Funds MagicBlock's delegation record and metadata accounts. For
    /// sponsored transactions this is the backend fee-payer wallet.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Match participant authorizing delegation. Kept separate from `payer`
    /// so embedded wallets do not need SOL for delegation rent.
    pub player: Signer<'info>,

    /// CHECK: After delegation CPI, ownership transfers to the delegation
    /// program. UncheckedAccount with `del` avoids Anchor exit serialization
    /// on an account we no longer own (per MagicBlock delegation docs).
    #[account(mut, del)]
    pub chess_match: UncheckedAccount<'info>,
}

pub fn handle_delegate_match(ctx: Context<DelegateMatch>) -> Result<()> {
    require_keys_eq!(
        *ctx.accounts.chess_match.owner,
        *ctx.program_id,
        crate::errors::ChessError::InvalidMatchId
    );

    // Read match_id from the account data for PDA seed derivation,
    // and set delegation_uid + is_delegated before the CPI.
    // We must write these fields BEFORE delegating because after the CPI
    // the account is owned by the delegation program.
    let match_id = {
        let mut data = ctx.accounts.chess_match.try_borrow_mut_data()?;

        // Deserialize the current chess match state
        let mut chess_match: ChessMatch = ChessMatch::try_deserialize(&mut &data[..])
            .map_err(|_| error!(crate::errors::ChessError::InvalidMatchId))?;

        let match_id = chess_match.match_id.clone();

        // `UncheckedAccount` is required by the delegation macro because the
        // CPI changes ownership. Re-establish the normal typed-account
        // guarantees before authorizing or mutating anything.
        let (expected_match, canonical_bump) =
            Pubkey::find_program_address(&[CHESS_MATCH_SEED, match_id.as_bytes()], ctx.program_id);
        require_keys_eq!(
            ctx.accounts.chess_match.key(),
            expected_match,
            crate::errors::ChessError::InvalidMatchId
        );
        require_eq!(
            chess_match.bump,
            canonical_bump,
            crate::errors::ChessError::InvalidMatchId
        );
        // Authorization: only match players can delegate. The rent payer is
        // deliberately not used as the authority in sponsored transactions.
        let player = ctx.accounts.player.key();
        require!(
            player == chess_match.players[0] || player == chess_match.players[1],
            crate::errors::ChessError::UnauthorizedSigner
        );

        // Mark the account as delegated before the CPI transfers ownership.
        // delegation_uid uses a deterministic prefix so it can be looked up.
        chess_match.is_delegated = true;
        chess_match.delegation_uid = format!("chess-{}", match_id);

        // Serialize the updated state back into the account data buffer.
        // AccountSerialize::try_serialize writes discriminator + data.
        let mut cursor: &mut [u8] = &mut data;
        chess_match
            .try_serialize(&mut cursor)
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
