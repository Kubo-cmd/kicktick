// settle_round: CPI validate_stat + ternary/binary/window/shootout logic
use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

// CPI types matching txoracle validate_stat instruction

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

// CPI input: the complete validate_stat argument bundle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ValidateStatArgs {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub predicate: TraderPredicate,
    pub stat_a: StatTerm,
    pub stat_b: Option<StatTerm>,
    pub op: Option<BinaryExpression>,
}

#[derive(Accounts)]
pub struct SettleRound<'info> {
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

    /// CHECK: txoracle's daily_scores_merkle_roots PDA — seeds verified by CPI
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: txoracle program — invoked via CPI
    pub txoracle_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<SettleRound>,
    args: ValidateStatArgs,
) -> Result<()> {
    let round = &mut ctx.accounts.round;

    // Validate round state
    require!(round.status == RoundStatus::Locked || round.status == RoundStatus::Open, KickTickError::RoundAlreadySettled);
    require!(round.settlement_model == SettlementModel::OnChain, KickTickError::InvalidSettlementMethod);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp >= round.expires_at, KickTickError::RoundStillActive);

    // Map market type to expected statKey
    let expected_stat_key = market_type_to_stat_key(&round.market_type)?;

    // Validate the args match what we expect for this market type
    require!(
        args.stat_a.stat_to_prove.key == expected_stat_key,
        KickTickError::StatKeyMappingNotFound
    );

    // Build CPI instruction data — use Anchor Borsh serialization
    let ix_data = build_validate_stat_ix(&args)?;

    // Build CPI accounts
    let cpi_accounts = vec![
        solana_program::instruction::AccountMeta::new_readonly(
            ctx.accounts.daily_scores_merkle_roots.key(),
            false,
        ),
    ];

    // Build CPI instruction
    let ix = solana_program::instruction::Instruction {
        program_id: ctx.accounts.txoracle_program.key(),
        accounts: cpi_accounts,
        data: ix_data,
    };

    // Perform CPI call via raw invoke
    let result = solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.daily_scores_merkle_roots.to_account_info(),
            ctx.accounts.txoracle_program.to_account_info(),
        ],
    );

    match result {
        Ok(()) => {
            // CPI returned success — predicate was true
            apply_outcome(round, true, args.stat_a.stat_to_prove.key)?;
        }
        Err(e) => {
            // PredicateFailed means outcome = false
            let err_str = e.to_string();
            if err_str.contains("PredicateFailed") || err_str.contains("0x1781") {
                apply_outcome(round, false, args.stat_a.stat_to_prove.key)?;
            } else {
                msg!("CPI validate_stat failed: {:?}", e);
                return Err(KickTickError::CpiFailed.into());
            }
        }
    }

    round.status = RoundStatus::ResolvedPending;
    round.settle_at = clock.unix_timestamp;

    Ok(())
}

/// Map MarketType to the primary statKey value
fn market_type_to_stat_key(market_type: &MarketType) -> Result<u32> {
    match market_type {
        MarketType::NextGoalSide | MarketType::GoalInWindow => Ok(STATKEY_P1_GOALS),
        MarketType::NextCorner | MarketType::CornerInWindow => Ok(STATKEY_P1_CORNERS),
        MarketType::NextYellowCard | MarketType::YellowCardInWindow => Ok(STATKEY_P1_YC),
        MarketType::RedCardInMatch => Ok(STATKEY_P1_RC),
        MarketType::PenaltyShootoutShot => Ok(STATKEY_P1_GOALS), // relayer overrides with 5001/5002
        _ => Err(KickTickError::MarketTypeNotSupported.into()),
    }
}

/// Build serialized instruction data for txoracle.validate_stat CPI
/// Uses proper Anchor Borsh serialization (discriminator + borsh args)
fn build_validate_stat_ix(args: &ValidateStatArgs) -> Result<Vec<u8>> {
    let mut data = Vec::with_capacity(8 + 512);
    // Anchor 8-byte discriminator for validate_stat
    data.extend_from_slice(&VALIDATE_STAT_DISCRIMINATOR);
    // Borsh-serialized arguments — borsh as direct dep
    let args_bytes = borsh::to_vec(args).map_err(|_| KickTickError::CpiFailed)?;
    data.extend_from_slice(&args_bytes);
    Ok(data)
}

/// Apply the CPI result to the round's outcome
fn apply_outcome(round: &mut Round, predicate_result: bool, stat_key: u32) -> Result<()> {
    match round.market_type {
        MarketType::NextGoalSide | MarketType::NextCorner | MarketType::NextYellowCard => {
            // Ternary: relayer calls settle_round twice (Home/Away)
            // First call: statKey 1/3/7 (P1) — if true => Home (winner=1)
            // Second call: statKey 2/4/8 (P2) — if true => Away (winner=2)
            // If both false after deadline => NoGoal (winner=3)
            if predicate_result {
                match stat_key {
                    STATKEY_P1_GOALS | STATKEY_P1_YC | STATKEY_P1_CORNERS => {
                        round.outcome = RoundOutcome::Home;
                        round.winner = Some(1);
                    }
                    STATKEY_P2_GOALS | STATKEY_P2_YC | STATKEY_P2_CORNERS => {
                        round.outcome = RoundOutcome::Away;
                        round.winner = Some(2);
                    }
                    _ => {}
                }
            }
        }
        MarketType::GoalInWindow | MarketType::CornerInWindow
        | MarketType::YellowCardInWindow | MarketType::RedCardInMatch
        | MarketType::PenaltyShootoutShot => {
            // Binary markets
            if predicate_result {
                round.outcome = RoundOutcome::Yes;
                round.winner = Some(1);
            } else {
                round.outcome = RoundOutcome::No;
                round.winner = Some(2);
            }
        }
        _ => {}
    }
    Ok(())
}
