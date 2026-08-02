// confirm_round — finalize settlement after the finality delay (60s).

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ConfirmRound<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, round.match_pda.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
}

pub fn handler(ctx: Context<ConfirmRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::ResolvedPending,
        KicktickError::RoundNotPending
    );

    let now = Clock::get()?.unix_timestamp;
    let confirm_after = round
        .settle_at
        .checked_add(FINALITY_DELAY_SECONDS)
        .ok_or(KicktickError::Overflow)?;
    require!(now >= confirm_after, KicktickError::FinalityDelayNotElapsed);

    round.status = RoundStatus::Settled;
    round.claimed = true;
    Ok(())
}
