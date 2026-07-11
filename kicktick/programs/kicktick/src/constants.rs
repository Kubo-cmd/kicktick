use anchor_lang::prelude::*;

// TxODDS Oracle program (devnet)
pub const TXORACLE_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");


// PDA seed prefixes
pub const SEED_CONFIG: &[u8] = b"config";
pub const SEED_MATCH: &[u8] = b"match";
pub const SEED_MATCH_VAULT: &[u8] = b"match_vault";
pub const SEED_ROUND: &[u8] = b"round";
pub const SEED_POSITION: &[u8] = b"position";
pub const SEED_SPONSOR_VAULT: &[u8] = b"sponsor_vault";

// Market duration limits
pub const MIN_MARKET_DURATION: i64 = 15;
pub const MAX_MARKET_DURATION: i64 = 300;

// Round timing defaults
pub const DEFAULT_LOCK_SECONDS: i64 = 15;
pub const DEFAULT_DEADLINE_SECONDS: i64 = 120;
pub const FINALITY_DELAY_SECONDS: i64 = 60;

// Minimum liquidity required for a round
pub const MIN_ROUND_LIQUIDITY: u64 = 10_000_000; // 0.01 SOL in lamports

// CPI compute budget
pub const CPI_COMPUTE_UNITS: u32 = 1_400_000;

// StatKey constants (from TxLINE Soccer Feed v1.0)
pub const STATKEY_P1_GOALS: u32 = 1;
pub const STATKEY_P2_GOALS: u32 = 2;
pub const STATKEY_P1_YC: u32 = 3;
pub const STATKEY_P2_YC: u32 = 4;
pub const STATKEY_P1_RC: u32 = 5;
pub const STATKEY_P2_RC: u32 = 6;
pub const STATKEY_P1_CORNERS: u32 = 7;
pub const STATKEY_P2_CORNERS: u32 = 8;

// Period modifiers
pub const PERIOD_H1: i32 = 0;
pub const PERIOD_H2: i32 = 1000;
pub const PERIOD_ET1: i32 = 2000;
pub const PERIOD_ET2: i32 = 3000;
pub const PERIOD_PE: i32 = 5000;

// validate_stat CPI discriminator
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];
