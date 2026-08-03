// src/instructions/abort_match.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct AbortMatch<'info> {
    #[account(
        mut,
        seeds = [CHESS_MATCH_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.bump,
        constraint = chess_match.game_status == GameStatus::WaitingForOpponent @ ChessError::MatchNotWaitingForOpponent,
        constraint = chess_match.players[0] == player_signer.key() @ ChessError::NotMatchCreator,
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(
        mut,
        seeds = [MATCH_ESCROW_SEED, chess_match.match_id.as_bytes()],
        bump = chess_match.match_escrow_bump,
    )]
    pub match_escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = player_token_account.owner == chess_match.players[0] @ ChessError::InvalidOwner,
        constraint = player_token_account.mint == chess_match.betting_token_mint @ ChessError::InvalidMint,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    pub player_signer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_abort_match(ctx: Context<AbortMatch>) -> Result<()> {
    // 1. Verify game_status == WaitingForOpponent (enforced by constraint)
    // 2. Verify signer == players[0] (enforced by constraint)

    // Extract AccountInfo refs before any mutable borrows
    let match_escrow_info = ctx.accounts.match_escrow_token_account.to_account_info();
    let player_token_account_info = ctx.accounts.player_token_account.to_account_info();
    let player_signer_info = ctx.accounts.player_signer.to_account_info();

    // Derive the PDA that is the authority of the escrow token account
    let (pda_authority, escrow_bump_seed) = Pubkey::find_program_address(
        &[MATCH_ESCROW_SEED, &ctx.accounts.chess_match.match_id.as_bytes()],
        ctx.program_id,
    );

    // Verify escrow ownership (same pattern as payout_logic.rs)
    if ctx.accounts.match_escrow_token_account.owner != pda_authority {
        return err!(ChessError::InvalidEscrowAccount);
    }

    // Capture match-level data needed for signing and event before mutable borrow
    let match_id = ctx.accounts.chess_match.match_id.clone();
    let creator_key = ctx.accounts.chess_match.players[0];

    // Prepare signer seeds for the escrow PDA (for token transfer)
    let match_id_bytes = match_id.as_bytes();
    let escrow_seeds: &[&[u8]] = &[
        MATCH_ESCROW_SEED,
        &match_id_bytes,
        &[escrow_bump_seed],
    ];
    let escrow_signer_seeds: &[&[&[u8]]] = &[&escrow_seeds[..]];

    // 3. Transfer the full escrow balance back to the creator (PDA-signed)
    let escrow_balance = ctx.accounts.match_escrow_token_account.amount;
    if escrow_balance > 0 {
        msg!(
            "Returning {} tokens from escrow back to creator: {}",
            escrow_balance,
            creator_key
        );
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: match_escrow_info.clone(),
                    to: player_token_account_info.clone(),
                    authority: match_escrow_info.clone(),
                },
                escrow_signer_seeds,
            ),
            escrow_balance,
        )?;
    }

    // 4. Close the escrow token account (return lamports to creator)
    // The token account authority is the escrow PDA, so we sign with escrow seeds
    msg!("Closing escrow token account, returning rent to creator.");

    token::close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: match_escrow_info.clone(),
                destination: player_signer_info.clone(),
                authority: match_escrow_info.clone(),
            },
            escrow_signer_seeds,
        ),
    )?;

    // Now obtain mutable reference to update state
    let chess_match = &mut ctx.accounts.chess_match;

    // 5. Set game_status to Aborted
    chess_match.game_status = GameStatus::Aborted;
    chess_match.game_end_reason = Some(GameEndReason::Aborted);

    // 6. Set payout_processed to prevent any settlement attempts
    chess_match.payout_processed = true;

    // 7. Emit MatchAbortedEvent
    emit!(MatchAbortedEvent {
        match_id,
        creator: creator_key,
    });

    msg!("Match aborted: {}", chess_match.match_id);
    Ok(())
}
