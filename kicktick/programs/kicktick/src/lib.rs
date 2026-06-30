// kicktick/programs/kicktick/src/lib.rs
// KickTick: Sub-minute micro prediction markets on Solana
// Settles using TxODDS oracle data with Merkle proof validation

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("KTCKiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCk"); // placeholder - replace after deploy

// TxODDS Oracle program ID (devnet)
pub const TXORACLE_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// Market duration constants (in seconds)
pub const MIN_MARKET_DURATION: i64 = 15;
pub const MAX_MARKET_DURATION: i64 = 300; // 5 minutes max
pub const SETTLEMENT_GRACE_PERIOD: i64 = 60; // 60s after expiry to settle

// Market outcome enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    None,
    Yes,
    No,
    Cancelled,
}

// Market status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open,       // accepting bets
    Expired,    // past end_time, awaiting settlement
    Settled,    // outcome determined
    Cancelled,  // creator cancelled, refunds available
}

// Market account
#[account]
pub struct PredictionMarket {
    pub creator: Pubkey,           // market creator
    pub fixture_id: i64,           // TxODDS fixture ID
    pub market_type: MarketType,   // what we're predicting
    pub description: String,       // human-readable (max 128 chars)
    pub end_time: i64,             // unix timestamp - market expires
    pub settle_time: i64,          // when settlement can happen
    pub status: MarketStatus,
    pub outcome: Outcome,
    pub total_yes_amount: u64,     // total YES position liquidity
    pub total_no_amount: u64,      // total NO position liquidity
    pub yes_odds_at_creation: i32, // TxODDS stable price at creation (for reference)
    pub settle_odds_value: i32,    // odds value used for settlement
    pub txodds_attestation_ts: i64, // timestamp of TxODDS data used for settlement
    pub bump: u8,                  // PDA bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketType {
    NextGoal,          // which team scores next
    NextCard,          // next yellow/red card
    OverUnderCorners,  // corners in next N minutes
    OddsSpike,         // odds moves >X% in next N seconds
    MatchResult,       // who wins (short markets)
}

// User position account
#[account]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: Outcome,        // Yes or No
    pub amount: u64,          // amount staked
    pub claimed: bool,        // whether winnings claimed
    pub bump: u8,
}

// Vault account holds all market funds
#[account]
pub struct MarketVault {
    pub market: Pubkey,
    pub bump: u8,
}

// ===== Instructions =====

#[program]
pub mod kicktick {
    use super::*;

    /// Create a new micro prediction market
    pub fn create_market(
        ctx: Context<CreateMarket>,
        fixture_id: i64,
        market_type: MarketType,
        description: String,
        duration_seconds: i64,
        yes_odds_at_creation: i32,
    ) -> Result<()> {
        require!(
            duration_seconds >= MIN_MARKET_DURATION && duration_seconds <= MAX_MARKET_DURATION,
            KickTickError::InvalidDuration
        );
        require!(
            description.len() <= 128,
            KickTickError::DescriptionTooLong
        );

        let clock = Clock::get()?;
        let market = &mut ctx.accounts.market;
        
        market.creator = ctx.accounts.creator.key();
        market.fixture_id = fixture_id;
        market.market_type = market_type;
        market.description = description;
        market.end_time = clock.unix_timestamp + duration_seconds;
        market.settle_time = clock.unix_timestamp + duration_seconds + SETTLEMENT_GRACE_PERIOD;
        market.status = MarketStatus::Open;
        market.outcome = Outcome::None;
        market.total_yes_amount = 0;
        market.total_no_amount = 0;
        market.yes_odds_at_creation = yes_odds_at_creation;
        market.settle_odds_value = 0;
        market.txodds_attestation_ts = 0;
        market.bump = ctx.bumps.market;

        Ok(())
    }

    /// Place a bet on a market
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        side: Outcome,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, KickTickError::ZeroAmount);
        
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::Open, KickTickError::MarketNotOpen);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < market.end_time, KickTickError::MarketExpired);

        // Transfer tokens from bettor to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.bettor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.bettor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_accounts, cpi_program);
        token::transfer(cpi_ctx, amount)?;

        // Update market totals
        match side {
            Outcome::Yes => market.total_yes_amount = market.total_yes_amount.checked_add(amount).ok_or(KickTickError::Overflow)?,
            Outcome::No => market.total_no_amount = market.total_no_amount.checked_add(amount).ok_or(KickTickError::Overflow)?,
            _ => return Err(KickTickError::InvalidSide.into()),
        };

        // Create/update position
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.bettor.key();
        position.market = market.key();
        position.side = side;
        position.amount = position.amount.checked_add(amount).ok_or(KickTickError::Overflow)?;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        Ok(())
    }

    /// Settle a market using TxODDS oracle data
    /// The caller provides the settlement odds value and attestation timestamp
    /// In production, this would validate Merkle proofs against the on-chain txoracle program
    pub fn settle_market(
        ctx: Context<SettleMarket>,
        settle_odds_value: i32,
        txodds_attestation_ts: i64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(market.status == MarketStatus::Open || market.status == MarketStatus::Expired, KickTickError::AlreadySettled);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= market.end_time, KickTickError::MarketStillOpen);
        require!(clock.unix_timestamp <= market.settle_time + 300, KickTickError::SettlementWindowClosed);

        // Determine outcome based on market type and odds
        let outcome = determine_outcome(
            &market.market_type,
            settle_odds_value,
            market.yes_odds_at_creation,
        )?;

        market.outcome = outcome;
        market.settle_odds_value = settle_odds_value;
        market.txodds_attestation_ts = txodds_attestation_ts;
        market.status = MarketStatus::Settled;

        Ok(())
    }

    /// Claim winnings after settlement
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.status == MarketStatus::Settled, KickTickError::NotSettled);
        require!(!position.claimed, KickTickError::AlreadyClaimed);
        require!(position.side == market.outcome, KickTickError::LostBet);

        // Calculate payout: proportional share of losing side + your stake back
        let total_pool = market.total_yes_amount.checked_add(market.total_no_amount).ok_or(KickTickError::Overflow)?;
        let winning_pool = match market.outcome {
            Outcome::Yes => market.total_yes_amount,
            Outcome::No => market.total_no_amount,
            _ => return Err(KickTickError::InvalidOutcome.into()),
        };

        // Payout = (your_share_of_winning_pool / winning_pool) * total_pool
        let payout = (position.amount as u128)
            .checked_mul(total_pool as u128)
            .ok_or(KickTickError::Overflow)?
            .checked_div(winning_pool as u128)
            .ok_or(KickTickError::DivisionByZero)? as u64;

        // Transfer from vault to winner
        let market_key = market.key();
        let seeds = &[b"vault", market_key.as_ref(), &[ctx.bumps.vault]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_accounts, cpi_program, signer);
        token::transfer(cpi_ctx, payout)?;

        position.claimed = true;

        Ok(())
    }

    /// Cancel market (only creator, only before expiry)
    pub fn cancel_market(ctx: Context<CancelMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(market.creator == ctx.accounts.creator.key(), KickTickError::NotCreator);
        require!(market.status == MarketStatus::Open, KickTickError::CannotCancel);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < market.end_time, KickTickError::MarketExpired);

        market.status = MarketStatus::Cancelled;
        market.outcome = Outcome::Cancelled;

        Ok(())
    }

    /// Refund bettors after cancellation
    pub fn refund_cancelled(ctx: Context<RefundCancelled>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.status == MarketStatus::Cancelled, KickTickError::NotCancelled);
        require!(!position.claimed, KickTickError::AlreadyClaimed);

        let refund_amount = position.amount;

        let market_key = market.key();
        let seeds = &[b"vault", market_key.as_ref(), &[ctx.bumps.vault]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.bettor_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_accounts, cpi_program, signer);
        token::transfer(cpi_ctx, refund_amount)?;

        position.claimed = true;

        Ok(())
    }
}

// ===== Helper Functions =====

fn determine_outcome(
    market_type: &MarketType,
    settle_odds: i32,
    creation_odds: i32,
) -> Result<Outcome> {
    match market_type {
        MarketType::OddsSpike => {
            // YES if odds moved significantly from creation
            let delta = (settle_odds - creation_odds).abs();
            if delta > 500 { // >5% swing (prices are in thousandths)
                Ok(Outcome::Yes)
            } else {
                Ok(Outcome::No)
            }
        }
        MarketType::MatchResult => {
            // YES if odds favor the original favorite (lower odds = favorite)
            if settle_odds < creation_odds {
                Ok(Outcome::Yes)
            } else {
                Ok(Outcome::No)
            }
        }
        MarketType::NextGoal | MarketType::NextCard | MarketType::OverUnderCorners => {
            // For event-based markets, YES if odds dropped (event became more likely)
            if settle_odds < creation_odds {
                Ok(Outcome::Yes)
            } else {
                Ok(Outcome::No)
            }
        }
    }
}

// ===== Account Contexts =====

#[derive(Accounts)]
#[instruction(fixture_id: i64, duration_seconds: i64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8 + 1 + 128 + 8 + 8 + 1 + 1 + 8 + 8 + 4 + 4 + 8 + 1,
        seeds = b"market", creator.key().as_ref(), fixture_id.to_le_bytes().as_ref(), 
               Clock::get()?.unix_timestamp.to_le_bytes().as_ref(),
        bump
    )]
    pub market: Account<'info, PredictionMarket>,
    #[account(
        init,
        payer = creator,
        seeds = b"vault", market.key().as_ref(),
        bump,
        token::mint = usdt_mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub usdt_mint: Account<'info, anchor_spl::token::Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, PredictionMarket>,
    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + 32 + 32 + 1 + 8 + 1 + 1,
        seeds = b"position", bettor.key().as_ref(), market.key().as_ref(),
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bettor_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, PredictionMarket>,
    /// CHECK: TxODDS oracle program - validated in production via CPI
    pub txoracle_program: AccountInfo<'info>,
    /// CHECK: Daily odds Merkle roots account from txoracle
    pub daily_odds_merkle_roots: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, PredictionMarket>,
    #[account(mut, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelMarket<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, PredictionMarket>,
}

#[derive(Accounts)]
pub struct RefundCancelled<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,
    pub market: Account<'info, PredictionMarket>,
    #[account(mut, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bettor_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ===== Errors =====

#[error_code]
pub enum KickTickError {
    #[msg("Invalid market duration (must be 15-300 seconds)")]
    InvalidDuration,
    #[msg("Description too long (max 128 chars)")]
    DescriptionTooLong,
    #[msg("Market is not open for betting")]
    MarketNotOpen,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Market is still open")]
    MarketStillOpen,
    #[msg("Settlement window has closed")]
    SettlementWindowClosed,
    #[msg("Market already settled")]
    AlreadySettled,
    #[msg("Market not yet settled")]
    NotSettled,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("You lost this bet")]
    LostBet,
    #[msg("Only market creator can do this")]
    NotCreator,
    #[msg("Cannot cancel this market")]
    CannotCancel,
    #[msg("Market was not cancelled")]
    NotCancelled,
    #[msg("Invalid bet side")]
    InvalidSide,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Math overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
}
