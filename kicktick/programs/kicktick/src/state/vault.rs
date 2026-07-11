use anchor_lang::prelude::*;

#[account]
pub struct SponsorVault {
    pub total_balance: u64,
    pub allocated: u64,
    pub bump: u8,
}

impl SponsorVault {
    pub const LEN: usize = 8 + 8 + 8 + 1;
}
