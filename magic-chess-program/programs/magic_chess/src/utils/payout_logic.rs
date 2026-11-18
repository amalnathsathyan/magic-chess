// src/utils/payout_logic.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::state::ChessMatch;

/// Platform fee on a pot, in `u128` so a very large pot can't overflow the
/// multiplication and leave the match impossible to settle.
pub fn compute_fee(total_pot: u64, fee_basis_points: u16) -> Result<u64> {
    let fee = (total_pot as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(ChessError::MathError)?
        / 10_000u128;
    u64::try_from(fee).map_err(|_| error!(ChessError::MathError))
}

/// Transfer `amount` out of the match escrow, signed by the escrow PDA (the
/// escrow token account is its own authority). The caller's account
/// constraints have already checked the escrow address against its seeds and
/// stored bump, so no address derivation is repeated here.
pub fn transfer_from_escrow<'info>(
    chess_match: &ChessMatch,
    escrow: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [chess_match.match_escrow_bump];
    let seeds: &[&[u8]] = &[MATCH_ESCROW_SEED, chess_match.match_id.as_bytes(), &bump];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: escrow.clone(),
                to: destination.clone(),
                authority: escrow.clone(),
            },
            &[seeds],
        ),
        amount,
    )
}

/// Winner takes the pot minus the platform fee.
pub fn process_payout<'info>(
    chess_match: &ChessMatch,
    escrow: &AccountInfo<'info>,
    winner_token_account: &AccountInfo<'info>,
    platform_token_account: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let fee = compute_fee(chess_match.total_pot, chess_match.platform_fee_basis_points)?;
    let winner_amount = chess_match
        .total_pot
        .checked_sub(fee)
        .ok_or(ChessError::MathError)?;

    transfer_from_escrow(chess_match, escrow, platform_token_account, token_program, fee)?;
    transfer_from_escrow(chess_match, escrow, winner_token_account, token_program, winner_amount)
}

/// Draw: the pot minus the fee is split; White gets the lower half and Black
/// the remainder.
pub fn process_draw_payout<'info>(
    chess_match: &ChessMatch,
    escrow: &AccountInfo<'info>,
    player_one_token_account: &AccountInfo<'info>,
    player_two_token_account: &AccountInfo<'info>,
    platform_token_account: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let fee = compute_fee(chess_match.total_pot, chess_match.platform_fee_basis_points)?;
    let remaining_pot = chess_match
        .total_pot
        .checked_sub(fee)
        .ok_or(ChessError::MathError)?;
    let player_one_refund = remaining_pot / 2;
    let player_two_refund = remaining_pot
        .checked_sub(player_one_refund)
        .ok_or(ChessError::MathError)?;

    transfer_from_escrow(chess_match, escrow, platform_token_account, token_program, fee)?;
    transfer_from_escrow(chess_match, escrow, player_one_token_account, token_program, player_one_refund)?;
    transfer_from_escrow(chess_match, escrow, player_two_token_account, token_program, player_two_refund)
}
