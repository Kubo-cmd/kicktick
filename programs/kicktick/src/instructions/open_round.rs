// open_round — open a new market round on a match.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct OpenRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MATCH_SEED, &match_pda.fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        init,
        payer = authority,
        space = Round::LEN,
        seeds = [ROUND_SEED, match_pda.key().as_ref(), &round_id.to_le_bytes()],
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
        lock_seconds >= MIN_MARKET_DURATION && lock_seconds <= MAX_MARKET_DURATION,
        KicktickError::InvalidLockDuration
    );
    require!(
        deadline_seconds <= MAX_MARKET_DURATION,
        KicktickError::InvalidDeadline
    );

    let now = Clock::get()?.unix_timestamp;
    let round = &mut ctx.accounts.round;
    let match_pda = &mut ctx.accounts.match_pda;

    round.match_pda = match_pda.key();
    round.round_id = round_id;
    round.market_type = market_type;
    round.params = RoundParams { lock_seconds, deadline_seconds };
    round.settlement_model = market_type.settlement_model();
    round.status = RoundStatus::Open;
    round.outcome = RoundOutcome::None;
    round.total_yes = 0;
    round.total_no = 0;
    round.total_abstain = 0;
    round.expires_at = now.checked_add(deadline_seconds).ok_or(KicktickError::Overflow)?;
    round.settle_at = 0;
    round.winner = None;
    round.claimed = false;
    round.bump = ctx.bumps.round;

    match_pda.round_counter = match_pda
        .round_counter
        .checked_add(1)
        .ok_or(KicktickError::Overflow)?;
    Ok(())
}
