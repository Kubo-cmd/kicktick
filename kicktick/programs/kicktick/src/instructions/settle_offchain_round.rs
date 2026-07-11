use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

#[derive(Accounts)]
pub struct SettleOffchainRound<'info> {
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

pub fn handler(ctx: Context<SettleOffchainRound>, outcome: RoundOutcome, winner: u8) -> Result<()> {
    let round = &mut ctx.accounts.round;

    require!(round.status == RoundStatus::Locked || round.status == RoundStatus::Open, KickTickError::RoundAlreadySettled);
    require!(round.settlement_model == SettlementModel::OffChain, KickTickError::InvalidSettlementMethod);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp >= round.expires_at, KickTickError::RoundStillActive);

    require!(
        outcome == RoundOutcome::Yes
            || outcome == RoundOutcome::No
            || outcome == RoundOutcome::Cancelled
            || outcome == RoundOutcome::Home
            || outcome == RoundOutcome::Away
            || outcome == RoundOutcome::NoGoal,
        KickTickError::InvalidSide
    );

    round.outcome = outcome;
    round.winner = Some(winner);
    round.status = RoundStatus::ResolvedPending;
    round.settle_at = clock.unix_timestamp;

    Ok(())
}
