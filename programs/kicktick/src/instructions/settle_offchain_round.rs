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

pub fn handler(
    ctx: Context<SettleOffchainRound>,
    outcome: RoundOutcome,
    winner: u8,
) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::Open || round.status == RoundStatus::Locked,
        KicktickError::RoundNotSettleable
    );
    require!(winner <= 3, KicktickError::InvalidWinner);

    let now = Clock::get()?.unix_timestamp;
    round.outcome = outcome;
    round.winner = Some(winner);
    round.status = RoundStatus::ResolvedPending;
    round.settle_at = now;
    Ok(())
}
