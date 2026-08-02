// Position PDA — one per bettor per round.
// Seeds: ["position", fixture_id (i64 LE), round_id (u64 LE), owner]

use anchor_lang::prelude::*;

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub fixture_id: i64,
    pub round_id: u64,
    /// 0 = YES, 1 = NO, 2 = abstain
    pub side: u8,
    pub amount: u64,
    pub claimed: bool,
}

impl Position {
    // 8 disc + 32 owner + 8 fixture + 8 round + 1 side + 8 amount + 1 claimed
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1 + 8 + 1;
}
