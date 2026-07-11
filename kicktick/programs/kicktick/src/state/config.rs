use anchor_lang::prelude::*;

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
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1;
}
