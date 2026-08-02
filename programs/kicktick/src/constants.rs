// KickTick — constants & seeds (single source of truth)
// Reconstructed from docs/agent/services/program/CONSTANTS.md

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::pubkey;

/// TxOracle program (devnet).
pub const TXORACLE_PROGRAM_ID: Pubkey =
    pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// ---- PDA seeds ----
pub const CONFIG_SEED: &[u8] = b"config";
pub const MATCH_SEED: &[u8] = b"match";
pub const MATCH_VAULT_SEED: &[u8] = b"match_vault";
pub const ROUND_SEED: &[u8] = b"round";
pub const POSITION_SEED: &[u8] = b"position";
pub const SPONSOR_VAULT_SEED: &[u8] = b"sponsor_vault";

// ---- Market / timing config ----
pub const MIN_MARKET_DURATION: i64 = 15; // seconds
pub const MAX_MARKET_DURATION: i64 = 300; // seconds (5 min)
pub const DEFAULT_LOCK_SECONDS: i64 = 15;
pub const DEFAULT_DEADLINE_SECONDS: i64 = 120;
pub const FINALITY_DELAY_SECONDS: i64 = 60;

/// Minimum round liquidity: 0.01 SOL in lamports.
pub const MIN_ROUND_LIQUIDITY: u64 = 10_000_000;

/// CPI compute-unit budget for validate_stat.
pub const CPI_COMPUTE_UNITS: u32 = 1_400_000;

// ---- TxLINE Soccer Feed v1.0 StatKeys ----
pub const STAT_P1_GOALS: u16 = 1;
pub const STAT_P2_GOALS: u16 = 2;
pub const STAT_P1_YELLOW: u16 = 3;
pub const STAT_P2_YELLOW: u16 = 4;
pub const STAT_P1_RED: u16 = 5;
pub const STAT_P2_RED: u16 = 6;
pub const STAT_P1_CORNERS: u16 = 7;
pub const STAT_P2_CORNERS: u16 = 8;
pub const STAT_P1_PEN_SHOOTOUT: u16 = 5001;
pub const STAT_P2_PEN_SHOOTOUT: u16 = 5002;

/// Period modifier: +1000 = first half, +2000 = second half.
pub const PERIOD_H1_OFFSET: u16 = 1000;
pub const PERIOD_H2_OFFSET: u16 = 2000;
