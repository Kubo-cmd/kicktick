// SponsorVault PDA — global sponsor liquidity pool.
// Seeds: ["sponsor_vault"]

use anchor_lang::prelude::*;

#[account]
pub struct SponsorVault {
    pub total_balance: u64,
    pub allocated: u64,
    pub bump: u8,
}

impl SponsorVault {
    // 8 disc + 8 total + 8 allocated + 1 bump
    pub const SIZE: usize = 8 + 8 + 8 + 1;
}
