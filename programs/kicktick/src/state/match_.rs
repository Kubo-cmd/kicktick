// Match_ PDA — one per fixture.
// Seeds: ["match", fixture_id (i64 LE)]
// Reconstructed from docs/agent/services/program/ARCHITECTURE.md

use anchor_lang::prelude::*;

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
}

impl Match_ {
    // 8 discriminator + 8 fixture + 1 status + (4+64) home + (4+64) away
    // + 4 competition + 1 bump + 8*4 counters/totals + 8 created
    pub const MAX_TEAM_LEN: usize = 64;
    pub const SIZE: usize = 8 + 8 + 1 + (4 + Self::MAX_TEAM_LEN) + (4 + Self::MAX_TEAM_LEN)
        + 4 + 1 + 8 + 8 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MatchStatus {
    Pending,
    Live,
    Finished,
    Cancelled,
}
