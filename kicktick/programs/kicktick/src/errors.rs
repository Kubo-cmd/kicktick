use anchor_lang::prelude::*;

#[error_code]
pub enum KickTickError {
    // Admin / Config
    #[msg("Unauthorized: only admin can call this")]
    Unauthorized,
    #[msg("Config already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Config not initialized")]
    ConfigNotInitialized,

    // Match
    #[msg("Match already exists")]
    MatchAlreadyExists,
    #[msg("Match not found")]
    MatchNotFound,
    #[msg("Match not active")]
    MatchNotActive,
    #[msg("Invalid fixture ID")]
    InvalidFixtureId,

    // Round
    #[msg("Round already exists")]
    RoundAlreadyExists,
    #[msg("Round not found")]
    RoundNotFound,
    #[msg("Round not open")]
    RoundNotOpen,
    #[msg("Round already settled")]
    RoundAlreadySettled,
    #[msg("Round not settled")]
    RoundNotSettled,
    #[msg("Round not confirmable yet")]
    RoundNotConfirmable,
    #[msg("Round already confirmed")]
    RoundAlreadyConfirmed,
    #[msg("Invalid market type")]
    InvalidMarketType,
    #[msg("Market type not supported for on-chain settlement")]
    MarketTypeNotSupported,

    // Duration / Timing
    #[msg("Invalid round duration (must be 15-300 seconds)")]
    InvalidDuration,
    #[msg("Round deadline has passed")]
    DeadlinePassed,
    #[msg("Round still active")]
    RoundStillActive,
    #[msg("Finality delay not met")]
    FinalityDelayNotMet,

    // Betting
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid bet side")]
    InvalidSide,

    // Sponsor / Liquidity
    #[msg("Insufficient sponsor liquidity")]
    InsufficientLiquidity,
    #[msg("Sponsor not found")]
    SponsorNotFound,
    #[msg("Minimum liquidity not met")]
    MinLiquidityNotMet,

    // Position
    #[msg("Position not found")]
    PositionNotFound,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Not a winner")]
    NotWinner,

    // Settlement
    #[msg("Cannot settle off-chain market type on-chain")]
    InvalidSettlementMethod,
    #[msg("CPI call to txoracle failed")]
    CpiFailed,
    #[msg("Stat key mapping not found for market type")]
    StatKeyMappingNotFound,
    #[msg("Proof sequence not provided")]
    MissingProofSequence,
    #[msg("Predicate returned false")]
    PredicateFailed,

    // Equivocation
    #[msg("No conflicting settlement found")]
    NoEquivocation,
    #[msg("Equivocation already challenged")]
    EquivocationAlreadyChallenged,

    // General
    #[msg("Math overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Account already initialized")]
    AlreadyInitialized,
    #[msg("Invalid account data")]
    InvalidAccountData,
}
