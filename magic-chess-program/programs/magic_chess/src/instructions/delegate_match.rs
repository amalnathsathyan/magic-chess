use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::constants::*;

#[delegate]
#[derive(Accounts)]
#[instruction(uid: String)]
pub struct DelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: After delegation CPI, ownership transfers to the delegation
    /// program. MagicBlock docs require AccountInfo with `del` — avoids
    /// Anchor exit serialization on an account we no longer own.
    #[account(mut, del)]
    pub chess_match: AccountInfo<'info>,
}

pub fn handle_delegate_match(ctx: Context<DelegateMatch>, uid: String) -> Result<()> {
    // Read match_id from account data. Layout after Anchor discriminator (8 bytes):
    //   match_id: String(4-byte len LE + bytes)
    let data = ctx.accounts.chess_match.try_borrow_data()?;
    let id_len = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let match_id = std::str::from_utf8(&data[12..12 + id_len])
        .map_err(|_| error!(crate::errors::ChessError::InvalidMatchId))?
        .to_string();
    drop(data);

    // Write delegation_uid + is_delegated BEFORE the CPI.
    // After CPI the program no longer owns this PDA, so writes would fail.
    // Byte offsets into the ChessMatch account (matches state/chess_match.rs layout):
    //   discriminator(8) + match_id(4+len) + players(64) + cpi(1) + ct(1)
    //   + lmt(8) + mtd(8) + gs(1) + ger(2) + board(192) + castling(4)
    //   + enp(3) + hmc(1) + fmn(2) + pos_hist(4+len*8) + btm(32)
    //   + bap1(8) + bap2(8) + tp(8) + pfbps(2) + pfw(32) + ppo(1)
    //   + prediction_enabled(1)
    //   → delegation_uid: String(4+len), is_delegated: bool(1)
    {
        let mut data = ctx.accounts.chess_match.try_borrow_mut_data()?;
        let id_len = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;

        // Calculate position_history length offset
        let pos_hist_len_offset = 8 + 4 + id_len + 64 + 1 + 1 + 8 + 8 + 1 + 2 + 192 + 4 + 3 + 1 + 2;
        let pos_hist_len = u32::from_le_bytes([
            data[pos_hist_len_offset], data[pos_hist_len_offset+1],
            data[pos_hist_len_offset+2], data[pos_hist_len_offset+3],
        ]) as usize;

        // prediction_enabled is right after position_history
        let pred_offset = pos_hist_len_offset + 4 + pos_hist_len * 8 + 32 + 8 + 8 + 8 + 2 + 32 + 1;

        // delegation_uid starts right after prediction_enabled
        let del_uid_offset = pred_offset + 1;

        // Write delegation_uid string (Borsh format: 4-byte len LE + bytes)
        let uid_bytes = uid.as_bytes();
        data[del_uid_offset..del_uid_offset + 4]
            .copy_from_slice(&(uid_bytes.len() as u32).to_le_bytes());
        data[del_uid_offset + 4..del_uid_offset + 4 + uid_bytes.len()]
            .copy_from_slice(uid_bytes);

        // is_delegated = true (1 byte)
        let is_del_offset = del_uid_offset + 4 + uid_bytes.len();
        data[is_del_offset] = 1;
    }

    // Release borrow, then delegate.
    ctx.accounts.delegate_chess_match(
        &ctx.accounts.payer,
        &[CHESS_MATCH_SEED, match_id.as_bytes()],
        DelegateConfig::default(),
    )?;

    Ok(())
}
