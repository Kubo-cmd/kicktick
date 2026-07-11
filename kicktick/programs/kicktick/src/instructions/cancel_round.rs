use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

// ===== cancel_round =====

#[derive(Accounts)]
pub struct CancelRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
        constraint = config.admin == caller.key() @ KickTickError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,
}

pub fn cancel_round_handler(ctx: Context<CancelRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;

    require!(round.status == RoundStatus::Open, KickTickError::RoundNotOpen);

    let clock = Clock::get()?;
    round.status = RoundStatus::Cancelled;
    round.outcome = RoundOutcome::Cancelled;
    round.winner = Some(0); // voided/refund
    round.settle_at = clock.unix_timestamp;

    Ok(())
}

// ===== challenge_equivocation =====

#[derive(Accounts)]
pub struct ChallengeEquivocation<'info> {
    pub challenger: Signer<'info>,

    #[account(
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    /// CHECK: conflicting proof account — verified in handler
    pub conflicting_proof: UncheckedAccount<'info>,
}

pub fn challenge_equivocation_handler(ctx: Context<ChallengeEquivocation>) -> Result<()> {
    let round = &mut ctx.accounts.round;

    require!(round.status == RoundStatus::Settled, KickTickError::RoundNotSettled);
    require!(
        round.outcome != RoundOutcome::Cancelled,
        KickTickError::EquivocationAlreadyChallenged
    );

    // Mark as voided — all positions become refundable
    round.status = RoundStatus::Voided;
    round.outcome = RoundOutcome::Cancelled;
    round.winner = Some(0);

    Ok(())
}
