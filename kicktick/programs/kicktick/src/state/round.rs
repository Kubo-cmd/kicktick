use anchor_lang::prelude::*;

// ===== Market Types =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketType {
    // On-chain settlement (CPI validate_stat)
    NextGoalSide,
    GoalInWindow,
    NextCorner,
    CornerInWindow,
    NextYellowCard,
    YellowCardInWindow,
    RedCardInMatch,
    PenaltyShootoutShot,
    // Off-chain settlement (relayer sets outcome)
    PenaltyShot,
    VARCheck,
}

// ===== Round Params =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SettlementModel {
    OnChain,
    OffChain,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct WindowParams {
    pub window_start_seq: i32,
    pub baseline_stat_a: i32,
    pub baseline_stat_b: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct ShootoutParams {
    pub round_number: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct RoundParams {
    pub lock_seconds: i64,
    pub deadline_seconds: i64,
    pub window: Option<WindowParams>,
    pub shootout: Option<ShootoutParams>,
}

impl RoundParams {
    pub fn new(lock: i64, deadline: i64) -> Self {
        Self {
            lock_seconds: lock,
            deadline_seconds: deadline,
            window: None,
            shootout: None,
        }
    }
}

// ===== Round Status =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoundStatus {
    Open,
    Locked,
    ResolvedPending,
    Settled,
    Voided,
    Cancelled,
}

impl Default for RoundStatus {
    fn default() -> Self {
        RoundStatus::Open
    }
}

// ===== Round Outcome =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoundOutcome {
    None,
    Yes,
    No,
    NoGoal,
    Home,
    Away,
    Cancelled,
}

impl Default for RoundOutcome {
    fn default() -> Self {
        RoundOutcome::None
    }
}

// ===== Round PDA =====

#[account]
pub struct Round {
    pub match_pda: Pubkey,
    pub round_id: u64,
    pub market_type: MarketType,
    pub params: RoundParams,
    pub settlement_model: SettlementModel,
    pub trigger_sse_seq: Option<u64>,
    pub baseline_stat: Option<[i64; 2]>,
    pub status: RoundStatus,
    pub outcome: RoundOutcome,
    pub total_yes: u64,
    pub total_no: u64,
    pub total_abstain: u64,
    pub lock_match_clock: i64,
    pub deadline_match_clock: i64,
    pub expires_at: i64,
    pub settle_at: i64,
    pub winner: Option<u8>,
    pub claimed: bool,
    pub bump: u8,
}

impl Round {
    pub const LEN: usize = 8
        + 32
        + 8
        + 1
        + 31  // RoundParams
        + 1
        + 9   // Option<u64>
        + 17  // Option<[i64; 2]>
        + 1
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 2   // Option<u8>
        + 1
        + 1;
}
