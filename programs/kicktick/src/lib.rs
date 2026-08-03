// KickTick — sub-minute micro prediction markets on Solana.
// Reconstructed from docs/agent/services/program spec (2026-08-01, Week 1 sprint).

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc");

#[program]
pub mod kicktick {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        instructions::init_config::handler(ctx)
    }

    pub fn init_match(
        ctx: Context<InitMatch>,
        fixture_id: i64,
        home_team: String,
        away_team: String,
    ) -> Result<()> {
        instructions::init_match::handler(ctx, fixture_id, home_team, away_team)
    }

    pub fn fund_sponsor(ctx: Context<FundSponsor>, amount: u64) -> Result<()> {
        instructions::fund_sponsor::fund_sponsor(ctx, amount)
    }

    pub fn sponsor_round(ctx: Context<SponsorRound>, amount: u64) -> Result<()> {
        instructions::fund_sponsor::sponsor_round(ctx, amount)
    }

    pub fn open_round(
        ctx: Context<OpenRound>,
        round_id: u64,
        market_type: MarketType,
        lock_seconds: i64,
        deadline_seconds: i64,
    ) -> Result<()> {
        instructions::open_round::handler(ctx, round_id, market_type, lock_seconds, deadline_seconds)
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        fixture_id: i64,
        round_id: u64,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::place_bet::handler(ctx, fixture_id, round_id, side, amount)
    }

    pub fn settle_round(
        ctx: Context<SettleRound>,
        oracle_value: u64,
        away_value: Option<u64>,
    ) -> Result<()> {
        instructions::settle_round::handler(ctx, oracle_value, away_value)
    }

    pub fn settle_offchain_round(
        ctx: Context<SettleOffchainRound>,
        outcome: RoundOutcome,
        winner: u8,
    ) -> Result<()> {
        instructions::settle_offchain_round::handler(ctx, outcome, winner)
    }

    pub fn confirm_round(ctx: Context<ConfirmRound>) -> Result<()> {
        instructions::confirm_round::handler(ctx)
    }

    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        fixture_id: i64,
        round_id: u64,
    ) -> Result<()> {
        let _ = (fixture_id, round_id);
        instructions::claim::claim_winnings_handler(ctx)
    }

    pub fn refund_bet(ctx: Context<ClaimWinnings>, fixture_id: i64, round_id: u64) -> Result<()> {
        let _ = (fixture_id, round_id);
        instructions::claim::refund_bet_handler(ctx)
    }

    pub fn cancel_round(ctx: Context<CancelRound>) -> Result<()> {
        instructions::cancel_round::cancel_round_handler(ctx)
    }

    pub fn challenge_equivocation(ctx: Context<ChallengeEquivocation>) -> Result<()> {
        instructions::cancel_round::challenge_equivocation_handler(ctx)
    }
}
