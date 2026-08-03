// settle_round — settle on-chain via CPI to TxOracle `validate_stat`.
//
// NOTE ON CPI WIRING: the docs specify settle_round CPIs txoracle::validate_stat
// with Merkle-proof accounts, but they do NOT include the txoracle IDL or its
// exact instruction account layout. Accepting signer-supplied values would permit
// forged outcomes, so this path fails closed until the real CPI validation exists.

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

pub fn handler(
    ctx: Context<SettleRound>,
    _oracle_value: u64,
    _away_value: Option<u64>,
) -> Result<()> {
    let round = &ctx.accounts.round;
    require!(
        round.status == RoundStatus::Open || round.status == RoundStatus::Locked,
        KicktickError::RoundNotSettleable
    );

    err!(KicktickError::OracleValidationFailed)
}
