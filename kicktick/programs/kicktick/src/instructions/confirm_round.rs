use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

#[derive(Accounts)]
pub struct ConfirmRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

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

pub fn handler(ctx: Context<ConfirmRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;

    require!(round.status == RoundStatus::ResolvedPending, KickTickError::RoundNotSettled);

    // Check finality delay
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= round.settle_at.checked_add(FINALITY_DELAY_SECONDS).ok_or(KickTickError::Overflow)?,
        KickTickError::FinalityDelayNotMet
    );

    round.status = RoundStatus::Settled;

    Ok(())
}
