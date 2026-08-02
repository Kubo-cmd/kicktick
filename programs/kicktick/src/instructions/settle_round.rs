// settle_round — settle on-chain via CPI to TxOracle `validate_stat`.
//
// NOTE ON CPI WIRING: the docs specify settle_round CPIs txoracle::validate_stat
// with Merkle-proof accounts, but they do NOT include the txoracle IDL or its
// exact instruction account layout. So this handler is written to be honest
// about the boundary: it computes the binary/ternary predicate for the round's
// MarketType and records the outcome, and the actual txoracle CPI is left as a
// clearly-marked integration seam (INTEGRATION.md) pending the txoracle IDL.
// We do NOT fabricate an account layout for an external program we don't own.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SettleRound<'info> {
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
        constraint = round.settlement_model == SettlementModel::OnChain
            @ KicktickError::InvalidSettlementModel,
    )]
    pub round: Account<'info, Round>,

    /// The TxOracle program (must match config).
    /// CHECK: address constraint against the configured oracle id.
    #[account(address = TXORACLE_PROGRAM_ID @ KicktickError::InvalidOracle)]
    pub txoracle_program: UncheckedAccount<'info>,
    // + remaining_accounts: txoracle Merkle-proof accounts (see INTEGRATION.md).
}

/// Result of evaluating the round predicate.
/// `oracle_value` is the stat value returned by validate_stat for the round's
/// StatKey; for ternary markets `away_value` carries the opposing side.
pub fn handler(ctx: Context<SettleRound>, oracle_value: u64, away_value: Option<u64>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.status == RoundStatus::Open || round.status == RoundStatus::Locked,
        KicktickError::RoundNotSettleable
    );

    let (_stat_key, threshold, is_ternary) = round.market_type.stat_predicate();

    let (outcome, winner) = if is_ternary {
        // home/away/draw style predicate.
        let away = away_value.unwrap_or(0);
        if oracle_value > away {
            (RoundOutcome::Home, 1u8)
        } else if away > oracle_value {
            (RoundOutcome::Away, 2u8)
        } else {
            (RoundOutcome::NoGoal, 3u8)
        }
    } else {
        // binary predicate: did the stat cross the threshold?
        if oracle_value >= threshold {
            (RoundOutcome::Yes, 1u8)
        } else {
            (RoundOutcome::No, 2u8)
        }
    };

    let now = Clock::get()?.unix_timestamp;
    round.outcome = outcome;
    round.winner = Some(winner);
    round.status = RoundStatus::ResolvedPending;
    round.settle_at = now;
    Ok(())
}
