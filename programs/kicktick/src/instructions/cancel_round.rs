// cancel_round — void an open round (authority) + challenge_equivocation.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelRound<'info> {
    /// Admins may cancel immediately. Any signer may cancel once the round's
    /// settlement deadline has elapsed, preventing permanent custody lockup.
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

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
    let now = Clock::get()?.unix_timestamp;
    require!(
        cancellation_is_authorized(
            ctx.accounts.authority.key(),
            ctx.accounts.config.admin,
            now,
            round.expires_at,
        ),
        KicktickError::CancellationDeadlineNotElapsed
    );
    round.status = RoundStatus::Cancelled;
    round.outcome = RoundOutcome::Cancelled;
    round.winner = Some(0);
    Ok(())
}

fn cancellation_is_authorized(authority: Pubkey, admin: Pubkey, now: i64, expires_at: i64) -> bool {
    authority == admin || now >= expires_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_can_cancel_before_deadline() {
        let admin = Pubkey::new_unique();
        assert!(cancellation_is_authorized(admin, admin, 99, 100));
    }

    #[test]
    fn any_signer_can_cancel_at_or_after_deadline() {
        let admin = Pubkey::new_unique();
        let caller = Pubkey::new_unique();
        assert!(!cancellation_is_authorized(caller, admin, 99, 100));
        assert!(cancellation_is_authorized(caller, admin, 100, 100));
        assert!(cancellation_is_authorized(caller, admin, 101, 100));
    }
}

#[derive(Accounts)]
pub struct ChallengeEquivocation<'info> {
    pub caller: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == caller.key() @ KicktickError::Unauthorized
    )]
    pub config: Account<'info, Config>,

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
        round.status == RoundStatus::ResolvedPending,
        KicktickError::RoundNotChallengeable
    );
    round.status = RoundStatus::Voided;
    round.winner = Some(0);
    Ok(())
}
