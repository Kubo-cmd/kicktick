// settle_offchain_round — relayer/authority sets the outcome directly.
// Used for off-chain markets (PenaltyShot, VARCheck).

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SettleOffchainRound<'info> {
    pub caller: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == caller.key() @ KicktickError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MATCH_SEED, &match_pda.fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [ROUND_SEED, match_pda.key().as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump,
        constraint = round.settlement_model == SettlementModel::OffChain
            @ KicktickError::InvalidSettlementModel,
    )]
    pub round: Account<'info, Round>,
}

pub fn handler(ctx: Context<SettleOffchainRound>, outcome: RoundOutcome, winner: u8) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::Open || round.status == RoundStatus::Locked,
        KicktickError::RoundNotSettleable
    );
    require!(winner <= 3, KicktickError::InvalidWinner);
    require!(
        outcome_allowed_for_market(round.market_type, outcome),
        KicktickError::InvalidMarketOutcome
    );
    require_eq!(
        winner,
        winner_for_outcome(outcome)?,
        KicktickError::OutcomeWinnerMismatch
    );
    require!(
        outcome == RoundOutcome::Cancelled
            || winning_pool(round.total_yes, round.total_no, round.total_abstain, winner)? > 0,
        KicktickError::EmptyWinningPool
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        settlement_window_open(
            now,
            round.expires_at,
            round.params.lock_seconds,
            round.params.deadline_seconds,
        )?,
        KicktickError::BettingWindowStillOpen
    );
    round.outcome = outcome;
    round.winner = Some(winner);
    round.status = RoundStatus::ResolvedPending;
    round.settle_at = now;
    Ok(())
}

pub(crate) fn winner_for_outcome(outcome: RoundOutcome) -> Result<u8> {
    match outcome {
        RoundOutcome::Yes | RoundOutcome::Home => Ok(1),
        RoundOutcome::No | RoundOutcome::Away => Ok(2),
        RoundOutcome::NoGoal => Ok(3),
        RoundOutcome::Cancelled => Ok(0),
        RoundOutcome::None => err!(KicktickError::OutcomeWinnerMismatch),
    }
}

fn winning_pool(yes_pool: u64, no_pool: u64, abstain_pool: u64, winner: u8) -> Result<u64> {
    match winner {
        1 => Ok(yes_pool),
        2 => Ok(no_pool),
        3 => Ok(abstain_pool),
        _ => err!(KicktickError::InvalidWinner),
    }
}

fn outcome_allowed_for_market(market_type: MarketType, outcome: RoundOutcome) -> bool {
    match market_type {
        MarketType::PenaltyShot | MarketType::VARCheck => matches!(
            outcome,
            RoundOutcome::Yes | RoundOutcome::No | RoundOutcome::Cancelled
        ),
        _ => false,
    }
}

fn settlement_window_open(
    now: i64,
    expires_at: i64,
    lock_seconds: i64,
    deadline_seconds: i64,
) -> Result<bool> {
    let opened_at = expires_at
        .checked_sub(deadline_seconds)
        .ok_or(KicktickError::Overflow)?;
    let locks_at = opened_at
        .checked_add(lock_seconds)
        .ok_or(KicktickError::Overflow)?;
    Ok(now >= locks_at)
}

#[cfg(test)]
mod tests {
    use super::{
        outcome_allowed_for_market, settlement_window_open, winner_for_outcome, winning_pool,
    };
    use crate::state::{MarketType, RoundOutcome};

    #[test]
    fn outcome_to_winner_mapping_is_complete_and_consistent() {
        assert_eq!(winner_for_outcome(RoundOutcome::Yes).unwrap(), 1);
        assert_eq!(winner_for_outcome(RoundOutcome::Home).unwrap(), 1);
        assert_eq!(winner_for_outcome(RoundOutcome::No).unwrap(), 2);
        assert_eq!(winner_for_outcome(RoundOutcome::Away).unwrap(), 2);
        assert_eq!(winner_for_outcome(RoundOutcome::NoGoal).unwrap(), 3);
        assert_eq!(winner_for_outcome(RoundOutcome::Cancelled).unwrap(), 0);
        assert!(winner_for_outcome(RoundOutcome::None).is_err());
    }

    #[test]
    fn offchain_markets_accept_only_binary_or_cancelled_outcomes() {
        assert!(outcome_allowed_for_market(
            MarketType::PenaltyShot,
            RoundOutcome::Yes
        ));
        assert!(outcome_allowed_for_market(
            MarketType::VARCheck,
            RoundOutcome::Cancelled
        ));
        assert!(!outcome_allowed_for_market(
            MarketType::PenaltyShot,
            RoundOutcome::Home
        ));
        assert!(!outcome_allowed_for_market(
            MarketType::GoalInWindow,
            RoundOutcome::Yes
        ));
    }

    #[test]
    fn settlement_stays_blocked_until_the_betting_lock_time() {
        let expires_at = 1_300;
        assert!(!settlement_window_open(1_014, expires_at, 15, 300).unwrap());
        assert!(settlement_window_open(1_015, expires_at, 15, 300).unwrap());
    }

    #[test]
    fn selected_winner_must_have_stake() {
        assert_eq!(winning_pool(0, 5_000_000, 0, 1).unwrap(), 0);
        assert_eq!(winning_pool(0, 5_000_000, 0, 2).unwrap(), 5_000_000);
        assert!(winning_pool(0, 5_000_000, 0, 0).is_err());
    }
}
