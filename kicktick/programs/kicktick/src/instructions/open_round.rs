use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

#[derive(Accounts)]
#[instruction(round_id: u64, market_type: MarketType, lock_seconds: i64, deadline_seconds: i64)]
pub struct OpenRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        init,
        payer = authority,
        space = Round::LEN,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump
    )]
    pub round: Account<'info, Round>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<OpenRound>,
    round_id: u64,
    market_type: MarketType,
    lock_seconds: i64,
    deadline_seconds: i64,
) -> Result<()> {
    require!(
        lock_seconds >= MIN_MARKET_DURATION && deadline_seconds <= MAX_MARKET_DURATION,
        KickTickError::InvalidDuration
    );

    let clock = Clock::get()?;
    let match_key = ctx.accounts.match_pda.key();
    let round = &mut ctx.accounts.round;
    let match_pda = &mut ctx.accounts.match_pda;

    round.match_pda = match_key;
    round.round_id = round_id;
    round.market_type = market_type;
    round.params = RoundParams::new(lock_seconds, deadline_seconds);
    round.settlement_model = match market_type {
        MarketType::PenaltyShot | MarketType::VARCheck | MarketType::NextGoalSide | MarketType::NextCorner | MarketType::NextYellowCard => SettlementModel::OffChain,
        _ => SettlementModel::OnChain,
    };
    round.trigger_sse_seq = None;
    round.baseline_stat = None;
    round.status = RoundStatus::Open;
    round.outcome = RoundOutcome::None;
    round.total_yes = 0;
    round.total_no = 0;
    round.total_abstain = 0;
    round.lock_match_clock = 0;
    round.deadline_match_clock = 0;
    round.expires_at = clock.unix_timestamp + deadline_seconds;
    round.settle_at = 0;
    round.winner = None;
    round.claimed = false;
    round.bump = ctx.bumps.round;

    // Increment round counter on match
    match_pda.round_counter = match_pda.round_counter.checked_add(1).ok_or(KickTickError::Overflow)?;

    Ok(())
}
