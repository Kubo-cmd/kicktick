use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

// ===== claim_winnings =====

#[derive(Accounts)]
#[instruction(fixture_id: i64, round_id: u64)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [SEED_POSITION, &fixture_id.to_le_bytes(), &round_id.to_le_bytes(), winner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == winner.key() @ KickTickError::NotWinner,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: vault PDA — system-owned, SOL held in lamports.
    #[account(mut, seeds = [SEED_MATCH_VAULT, match_pda.key().as_ref()], bump = match_pda.vault_bump)]
    pub match_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn claim_winnings_handler(ctx: Context<ClaimWinnings>, _fixture_id: i64, _round_id: u64) -> Result<()> {
    let round = &ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    require!(round.status == RoundStatus::Settled, KickTickError::RoundNotSettled);
    require!(!position.claimed, KickTickError::AlreadyClaimed);

    // Handle voided/cancelled rounds — full refund
    if round.winner == Some(0) || round.outcome == RoundOutcome::Cancelled {
        return refund_position(ctx);
    }

    // Check if position is a winner
    // round.winner: 1=YES, 2=NO, 3=abstain (1-based); position.side: 0=YES, 1=NO, 2=abstain (0-based)
    let is_winner = round.winner.map(|w| w.saturating_sub(1)) == Some(position.side);
    if !is_winner {
        return Err(KickTickError::NotWinner.into());
    }

    // Calculate pro-rata payout
    let total_pool = round.total_yes.checked_add(round.total_no)
        .and_then(|v| v.checked_add(round.total_abstain))
        .ok_or(KickTickError::Overflow)?;

    let winning_pool = match round.winner {
        Some(0) => unreachable!(), // voided — handled above
        Some(1) => round.total_yes,
        Some(2) => round.total_no,
        Some(3) => round.total_abstain,
        _ => return Err(KickTickError::NotWinner.into()),
    };

    require!(winning_pool > 0, KickTickError::DivisionByZero);

    // Payout = (position_amount / winning_pool) * total_pool
    let payout = (position.amount as u128)
        .checked_mul(total_pool as u128)
        .ok_or(KickTickError::Overflow)?
        .checked_div(winning_pool as u128)
        .ok_or(KickTickError::DivisionByZero)? as u64;

    // Transfer SOL from vault to winner via PDA signer
    let match_key = ctx.accounts.match_pda.key();
    let vault_bump = ctx.accounts.match_pda.vault_bump;
    let seeds = &[SEED_MATCH_VAULT, match_key.as_ref(), &[vault_bump]];
    let signer = &[&seeds[..]];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            *ctx.accounts.system_program.key,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.match_vault.to_account_info(),
                to: ctx.accounts.winner.to_account_info(),
            },
            signer,
        ),
        payout,
    )?;

    position.claimed = true;

    Ok(())
}

// ===== refund (cancelled/voided rounds) =====

#[derive(Accounts)]
#[instruction(fixture_id: i64, round_id: u64)]
pub struct RefundBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [SEED_POSITION, &fixture_id.to_le_bytes(), &round_id.to_le_bytes(), bettor.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == bettor.key() @ KickTickError::PositionNotFound,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: vault PDA.
    #[account(mut, seeds = [SEED_MATCH_VAULT, match_pda.key().as_ref()], bump = match_pda.vault_bump)]
    pub match_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn refund_bet_handler(ctx: Context<RefundBet>, _fixture_id: i64, _round_id: u64) -> Result<()> {
    let round = &ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    require!(
        round.status == RoundStatus::Cancelled || round.status == RoundStatus::Voided,
        KickTickError::RoundNotSettled
    );
    require!(!position.claimed, KickTickError::AlreadyClaimed);

    refund_position_inner(
        ctx.accounts.match_pda.key(),
        ctx.accounts.match_pda.vault_bump,
        ctx.accounts.match_vault.to_account_info(),
        ctx.accounts.bettor.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        position,
    )
}

/// Internal refund — called from ClaimWinnings for voided/cancelled rounds
fn refund_position(ctx: Context<ClaimWinnings>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    refund_position_inner(
        ctx.accounts.match_pda.key(),
        ctx.accounts.match_pda.vault_bump,
        ctx.accounts.match_vault.to_account_info(),
        ctx.accounts.winner.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        position,
    )
}

fn refund_position_inner<'info>(
    match_key: Pubkey,
    vault_bump: u8,
    match_vault: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    position: &mut Account<'info, Position>,
) -> Result<()> {
    let refund_amount = position.amount;

    let seeds = &[SEED_MATCH_VAULT, match_key.as_ref(), &[vault_bump]];
    let signer = &[&seeds[..]];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            *system_program.key,
            anchor_lang::system_program::Transfer {
                from: match_vault,
                to: destination,
            },
            signer,
        ),
        refund_amount,
    )?;

    position.claimed = true;
    Ok(())
}
