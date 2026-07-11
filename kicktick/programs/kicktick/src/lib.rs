// kicktick/programs/kicktick/src/lib.rs
// KickTick: Sub-minute micro prediction markets on Solana
// Phase 1 — Anchor Program: Core (Match/Round/Position/Settlement)

#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use state::*;
use instructions::*;

declare_id!("a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2");

#[program]
pub mod kicktick {
    use super::*;

    // ===== 0.1 Config / Admin =====

    /// Initialize global Config PDA (one-time)
    pub fn init_config(
        ctx: Context<InitConfig>,
    ) -> Result<()> {
        instructions::init_config::handler(ctx)
    }

    // ===== 1.2.1 Match Management =====

    pub fn init_match(
        ctx: Context<InitMatch>,
        fixture_id: i64,
        home_team: String,
        away_team: String,
    ) -> Result<()> {
        instructions::init_match::handler(ctx, fixture_id, home_team, away_team)
    }

    // ===== Sponsor =====

    pub fn fund_sponsor(
        ctx: Context<FundSponsor>,
        amount: u64,
    ) -> Result<()> {
        instructions::fund_sponsor::fund_sponsor_handler(ctx, amount)
    }

    pub fn sponsor_round(
        ctx: Context<SponsorRound>,
        amount: u64,
    ) -> Result<()> {
        instructions::fund_sponsor::sponsor_round_handler(ctx, amount)
    }

    // ===== 1.2.2 Round Management =====

    pub fn open_round(
        ctx: Context<OpenRound>,
        round_id: u64,
        market_type: MarketType,
        lock_seconds: i64,
        deadline_seconds: i64,
    ) -> Result<()> {
        instructions::open_round::handler(ctx, round_id, market_type, lock_seconds, deadline_seconds)
    }

    // ===== 1.2.3 Betting =====

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        fixture_id: i64,
        round_id: u64,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::place_bet::handler(ctx, fixture_id, round_id, side, amount)
    }

    // ===== 1.3 Settlement =====

    /// Settle a round using CPI validate_stat against txoracle
    pub fn settle_round(
        ctx: Context<SettleRound>,
        args: ValidateStatArgs,
    ) -> Result<()> {
        instructions::settle_round::handler(ctx, args)
    }

    /// Settle an off-chain market type (PenaltyShot, VARCheck)
    pub fn settle_offchain_round(
        ctx: Context<SettleOffchainRound>,
        outcome: RoundOutcome,
        winner: u8,
    ) -> Result<()> {
        instructions::settle_offchain_round::handler(ctx, outcome, winner)
    }

    /// Confirm a settled round after finality delay
    pub fn confirm_round(
        ctx: Context<ConfirmRound>,
    ) -> Result<()> {
        instructions::confirm_round::handler(ctx)
    }

    /// Claim winnings for a winning position
    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        fixture_id: i64,
        round_id: u64,
    ) -> Result<()> {
        instructions::claim::claim_winnings_handler(ctx, fixture_id, round_id)
    }

    /// Refund a cancelled/voided round position
    pub fn refund_bet(
        ctx: Context<RefundBet>,
        fixture_id: i64,
        round_id: u64,
    ) -> Result<()> {
        instructions::claim::refund_bet_handler(ctx, fixture_id, round_id)
    }

    /// Cancel an open round
    pub fn cancel_round(
        ctx: Context<CancelRound>,
    ) -> Result<()> {
        instructions::cancel_round::cancel_round_handler(ctx)
    }

    /// Challenge a settlement for equivocation
    pub fn challenge_equivocation(
        ctx: Context<ChallengeEquivocation>,
    ) -> Result<()> {
        instructions::cancel_round::challenge_equivocation_handler(ctx)
    }
}
