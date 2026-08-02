// KickTick — error codes (reconstructed, superset of docs/agent/services/program spec)
use anchor_lang::prelude::*;

#[error_code]
pub enum KicktickError {
    #[msg("Unauthorized: signer is not the admin/authority")]
    Unauthorized,
    #[msg("Invalid fixture id")]
    InvalidFixture,
    #[msg("Team name too long (max 64 chars)")]
    TeamNameTooLong,
    #[msg("Invalid lock duration (15..=300s)")]
    InvalidLockDuration,
    #[msg("Invalid deadline (> 300s)")]
    InvalidDeadline,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Round is not open for betting")]
    RoundNotOpen,
    #[msg("Round has expired")]
    RoundExpired,
    #[msg("Invalid side (0=YES, 1=NO, 2=ABSTAIN)")]
    InvalidSide,
    #[msg("Invalid winner code (0..=3)")]
    InvalidWinner,
    #[msg("Wrong settlement model for this round")]
    InvalidSettlementModel,
    #[msg("Invalid oracle program address")]
    InvalidOracle,
    #[msg("Round is not in a settleable status")]
    RoundNotSettleable,
    #[msg("Round is not in ResolvedPending status")]
    RoundNotPending,
    #[msg("Finality delay has not elapsed")]
    FinalityDelayNotElapsed,
    #[msg("Round is not settled")]
    RoundNotSettled,
    #[msg("Round is not refundable (not void/cancelled)")]
    RoundNotRefundable,
    #[msg("Round cannot be cancelled in current status")]
    RoundNotCancellable,
    #[msg("Round cannot be challenged in current status")]
    RoundNotChallengeable,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Position is not on the winning side")]
    NotWinningSide,
    #[msg("Insufficient sponsor liquidity")]
    InsufficientSponsorLiquidity,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Oracle validation failed")]
    OracleValidationFailed,
}
