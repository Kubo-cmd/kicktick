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
    /// New positions store CURRENT_VERSION here. Legacy devnet positions used
    /// this trailing byte for the PDA bump, so keeping the byte after `claimed`
    /// preserves deserialization and permits safe void/cancel refunds.
    pub version: u8,
}

impl Position {
    pub const CURRENT_VERSION: u8 = 2;
    // 8 disc + 32 owner + 8 fixture + 8 round + 1 side + 8 amount + 1 claimed + 1 version
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1 + 8 + 1 + 1;
}

#[cfg(test)]
mod tests {
    use super::Position;
    use anchor_lang::{AccountDeserialize, Discriminator};

    #[test]
    fn deserializes_legacy_claimed_then_bump_layout() {
        let owner = anchor_lang::prelude::Pubkey::new_unique();
        let mut data = Vec::with_capacity(Position::SIZE);
        data.extend_from_slice(Position::DISCRIMINATOR);
        data.extend_from_slice(owner.as_ref());
        data.extend_from_slice(&(-42i64).to_le_bytes());
        data.extend_from_slice(&7u64.to_le_bytes());
        data.push(1);
        data.extend_from_slice(&50_000_000u64.to_le_bytes());
        data.push(0); // legacy claimed bool
        data.push(255); // legacy PDA bump, now a non-current version marker

        let position = Position::try_deserialize(&mut data.as_slice()).unwrap();
        assert_eq!(position.owner, owner);
        assert!(!position.claimed);
        assert_eq!(position.version, 255);
    }
}
