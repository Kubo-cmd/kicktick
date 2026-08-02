// cancel_round — void an open round (authority) + challenge_equivocation.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelRound<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, round.match_pda.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
}

pub fn cancel_round_handler(ctx: Context<CancelRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::Open || round.status == RoundStatus::Locked,
        KicktickError::RoundNotCancellable
    );
    round.status = RoundStatus::Cancelled;
    round.outcome = RoundOutcome::Cancelled;
    round.winner = Some(0);
    Ok(())
}

#[derive(Accounts)]
pub struct ChallengeEquivocation<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, round.match_pda.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
}

pub fn challenge_equivocation_handler(ctx: Context<ChallengeEquivocation>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::ResolvedPending || round.status == RoundStatus::Settled,
        KicktickError::RoundNotChallengeable
    );
    round.status = RoundStatus::Voided;
    round.winner = Some(0);
    Ok(())
}
