use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MatchStatus {
    Pending,
    Live,
    Finished,
    Cancelled,
}

impl Default for MatchStatus {
    fn default() -> Self {
        MatchStatus::Pending
    }
}

#[account]
pub struct Match_ {
    pub fixture_id: i64,
    pub status: MatchStatus,
    pub home_team: String,
    pub away_team: String,
    pub competition_id: i32,
    pub vault_bump: u8,
    pub round_counter: u64,
    pub total_deposited: u64,
    pub total_sponsored: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Match_ {
    pub const MAX_TEAM_NAME: usize = 64;

    pub const LEN: usize = 8
        + 8
        + 1
        + (4 + Self::MAX_TEAM_NAME)
        + (4 + Self::MAX_TEAM_NAME)
        + 4
        + 1
        + 8
        + 8
        + 8
        + 8
        + 1;
}
