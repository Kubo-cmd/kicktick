use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub txoracle_program_id: Pubkey,
    pub daily_scores_merkle_roots: Pubkey,
    pub finality_delay: i64,
    pub min_liquidity: u64,
    pub bump: u8,
}

impl Config {
    // 32*3 + 8 + 8 + 1
    pub const SPACE: usize = 32 + 32 + 32 + 8 + 8 + 1;
    // 8-byte discriminator + body
    pub const SIZE: usize = 8 + Self::SPACE;

    pub fn init(&mut self, admin: Pubkey, daily_scores_merkle_roots: Pubkey, bump: u8) {
        self.admin = admin;
        self.txoracle_program_id = TXORACLE_PROGRAM_ID;
        self.daily_scores_merkle_roots = daily_scores_merkle_roots;
        self.finality_delay = FINALITY_DELAY_SECONDS;
        self.min_liquidity = MIN_ROUND_LIQUIDITY;
        self.bump = bump;
    }
}
