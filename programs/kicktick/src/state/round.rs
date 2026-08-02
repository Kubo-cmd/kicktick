use anchor_lang::prelude::*;

use crate::constants::*;

/// Round timing parameters.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RoundParams {
    pub lock_seconds: i64,
    pub deadline_seconds: i64,
}

/// Market type — determines settlement model + StatKey predicate.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketType {
    // On-chain (CPI validate_stat)
    NextGoalSide,
    GoalInWindow,
    NextCorner,
    CornerInWindow,
    NextYellowCard,
    YellowCardInWindow,
    RedCardInMatch,
    PenaltyShootoutShot,
    // Off-chain (relayer sets outcome)
    PenaltyShot,
    VARCheck,
}

impl Default for MarketType {
    fn default() -> Self {
        MarketType::GoalInWindow
    }
}

impl MarketType {
    /// Off-chain markets are settled by the relayer, everything else via CPI.
    pub fn settlement_model(&self) -> SettlementModel {
        match self {
            MarketType::PenaltyShot | MarketType::VARCheck => SettlementModel::OffChain,
            _ => SettlementModel::OnChain,
        }
    }

    /// StatKey + threshold used to evaluate the predicate via validate_stat.
    /// Returns (stat_key_base, threshold, is_ternary).
    pub fn stat_predicate(&self) -> (u16, u64, bool) {
        match self {
            // Which side scores next: ternary home/away/draw, evaluated off goals.
            MarketType::NextGoalSide => (STAT_P1_GOALS, 1, true),
            // Goal in next N minutes.
            MarketType::GoalInWindow => (STAT_P1_GOALS, 1, false),
            MarketType::NextCorner => (STAT_P1_CORNERS, 1, false),
            MarketType::CornerInWindow => (STAT_P1_CORNERS, 1, false),
            MarketType::NextYellowCard => (STAT_P1_YELLOW, 1, false),
            MarketType::YellowCardInWindow => (STAT_P1_YELLOW, 1, false),
            MarketType::RedCardInMatch => (STAT_P1_RED, 1, false),
            MarketType::PenaltyShootoutShot => (STAT_P1_PEN_SHOOTOUT, 1, true),
            // Off-chain — predicate unused.
            MarketType::PenaltyShot => (0, 0, false),
            MarketType::VARCheck => (0, 0, false),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SettlementModel {
    #[default]
    OnChain,
    OffChain,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RoundStatus {
    #[default]
    Open,
    Locked,
    ResolvedPending,
    Settled,
    Voided,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RoundOutcome {
    #[default]
    None,
    Yes,
    No,
    NoGoal,
    Home,
    Away,
    Cancelled,
}

#[account]
pub struct Round {
    pub match_pda: Pubkey,
    pub round_id: u64,
    pub market_type: MarketType,
    pub params: RoundParams,
    pub settlement_model: SettlementModel,
    pub status: RoundStatus,
    pub outcome: RoundOutcome,
    pub total_yes: u64,
    pub total_no: u64,
    pub total_abstain: u64,
    pub expires_at: i64,
    pub settle_at: i64,
    /// 1=YES, 2=NO, 3=abstain, 0=void.
    pub winner: Option<u8>,
    pub claimed: bool,
    pub bump: u8,
}

impl Round {
    pub const LEN: usize = 8  // discriminator
        + 32                  // match_pda
        + 8                   // round_id
        + 1                   // market_type
        + RoundParams::LEN    // params
        + 1                   // settlement_model
        + 1                   // status
        + 1                   // outcome
        + 8                   // total_yes
        + 8                   // total_no
        + 8                   // total_abstain
        + 8                   // expires_at
        + 8                   // settle_at
        + 1 + 1               // winner Option<u8>
        + 1                   // claimed
        + 1; // bump

    pub fn is_open(&self) -> bool {
        self.status == RoundStatus::Open
    }
}

impl RoundParams {
    pub const LEN: usize = 8 + 8;
}
