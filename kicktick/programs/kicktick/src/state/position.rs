use anchor_lang::prelude::*;

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub fixture_id: i64,
    pub round_id: u64,
    pub side: u8,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1 + 8 + 1 + 1;
}
