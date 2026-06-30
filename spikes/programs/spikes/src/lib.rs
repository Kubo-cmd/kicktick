// spikes/programs/spikes/src/lib.rs
// SPIKES: Digital sticker album of dramatic odds moments as compressed NFTs
// Uses Metaplex Bubblegum for compressed NFTs on Solana

use anchor_lang::prelude::*;
use mpl_bubblegum::instructions::{TransferCpi, TransferCpiAccounts};

declare_id!("SPiKeSPiKeSPiKeSPiKeSPiKeSPiKeSPiKeSPiKeSPiKeS"); // placeholder

/// Market type for the spike moment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SpikeType {
    OddsSurge,    // odds jumped significantly
    OddsCrash,    // odds dropped significantly
    GoalScored,   // goal caused odds shift
    CardIssued,   // red/yellow card impact
    Comeback,     // team came back from behind
    Upset,        // underdog won
}

/// Spike Moment NFT metadata
#[account]
pub struct SpikeMoment {
    pub owner: Pubkey,           // current owner
    pub fixture_id: i64,         // TxODDS fixture ID
    pub spike_type: SpikeType,   // type of dramatic moment
    pub timestamp: i64,          // when the spike occurred
    pub odds_before: i32,        // odds before spike (thousandths)
    pub odds_after: i32,         // odds after spike (thousandths)
    pub description: String,     // human-readable (max 200 chars)
    pub mint: Pubkey,            // compressed NFT asset ID
    pub tree_id: Pubkey,         // Bubblegum tree address
    pub transferred: bool,       // whether it has been traded
    pub bump: u8,
}

/// Album tracking: which moments a user owns
#[account]
pub struct Album {
    pub owner: Pubkey,
    pub moment_count: u32,       // total moments owned
    pub unique_fixtures: u32,    // unique fixtures represented
    pub rare_count: u32,         // rare+ moments
    pub bump: u8,
}

/// Collection config / authority
#[account]
pub struct CollectionConfig {
    pub authority: Pubkey,
    pub tree_id: Pubkey,         // Bubblegum merkle tree
    pub collection_mint: Pubkey, // Metaplex collection NFT
    pub total_minted: u64,
    pub mint_fee_lamports: u64,
    pub bump: u8,
}

#[program]
pub mod spikes {
    use super::*;

    /// Initialize the SPIKES collection (one-time setup)
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        mint_fee_lamports: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.tree_id = ctx.accounts.tree.key();
        config.collection_mint = ctx.accounts.collection_mint.key();
        config.total_minted = 0;
        config.mint_fee_lamports = mint_fee_lamports;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    /// Mint a new Spike Moment as a compressed NFT
    pub fn mint_spike(
        Context<MintSpike>,
        fixture_id: i64,
        spike_type: SpikeType,
        timestamp: i64,
        odds_before: i32,
        odds_after: i32,
        description: String,
    ) -> Result<()> {
        require!(
            description.len() <= 200,
            SpikesError::DescriptionTooLong
        );

        let config = &mut ctx.accounts.config;
        let moment = &mut ctx.accounts.moment;
        let album = &mut ctx.accounts.album;

        // Verify the spike is significant enough (>10% move)
        let delta = (odds_after - odds_before).abs();
        require!(delta >= 100, SpikesError::NotSignificantEnough);

        // Collect mint fee
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.minter.to_account_info(),
            to: ctx.accounts.config.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
        );
        anchor_lang::system_program::transfer(cpi_ctx, config.mint_fee_lamports)?;

        // Record the moment
        moment.owner = ctx.accounts.minter.key();
        moment.fixture_id = fixture_id;
        moment.spike_type = spike_type;
        moment.timestamp = timestamp;
        moment.odds_before = odds_before;
        moment.odds_after = odds_after;
        moment.description = description;
        moment.mint = ctx.accounts.asset.key();
        moment.tree_id = config.tree_id;
        moment.transferred = false;
        moment.bump = ctx.bumps.moment;

        // Update album
        album.moment_count = album.moment_count.checked_add(1).ok_or(SpikesError::Overflow)?;
        album.unique_fixtures = album.unique_fixtures.checked_add(1).ok_or(SpikesError::Overflow)?;
        
        // Rare if >25% move
        if delta >= 250 {
            album.rare_count = album.rare_count.checked_add(1).ok_or(SpikesError::Overflow)?;
        }

        config.total_minted = config.total_minted.checked_add(1).ok_or(SpikesError::Overflow)?;

        Ok(())
    }

    /// Transfer a Spike Moment to another user (trading)
    pub fn transfer_spike(ctx: Context<TransferSpike>) -> Result<()> {
        let moment = &mut ctx.accounts.moment;
        let from_album = &mut ctx.accounts.from_album;
        let to_album = &mut ctx.accounts.to_album;

        require!(
            moment.owner == ctx.accounts.from.key(),
            SpikesError::NotOwner
        );

        // Update moment ownership
        moment.owner = ctx.accounts.to.key();
        moment.transferred = true;

        // Update albums
        from_album.moment_count = from_album.moment_count.saturating_sub(1);
        to_album.moment_count = to_album.moment_count.checked_add(1).ok_or(SpikesError::Overflow)?;

        Ok(())
    }

    /// Burn a Spike Moment (collectible destruction)
    pub fn burn_spike(ctx: Context<BurnSpike>) -> Result<()> {
        let moment = &mut ctx.accounts.moment;
        let album = &mut ctx.accounts.album;

        require!(
            moment.owner == ctx.accounts.owner.key(),
            SpikesError::NotOwner
        );

        album.moment_count = album.moment_count.saturating_sub(1);

        // Mark as burned (account will be closed)
        moment.owner = System::id();

        Ok(())
    }
}

// ===== Account Contexts =====

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 1,
        seeds = b"config",
        bump
    )]
    pub config: Account<'info, CollectionConfig>,
    /// CHECK: Bubblegum tree account
    pub tree: AccountInfo<'info>,
    /// CHECK: Collection NFT mint
    pub collection_mint: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintSpike<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub config: Account<'info, CollectionConfig>,
    #[account(
        init,
        payer = minter,
        space = 8 + 32 + 8 + 1 + 8 + 4 + 4 + 200 + 32 + 32 + 1 + 1,
        seeds = b"moment", config.key().as_ref(), config.total_minted.to_le_bytes().as_ref(),
        bump
    )]
    pub moment: Account<'info, SpikeMoment>,
    #[account(
        init_if_needed,
        payer = minter,
        space = 8 + 32 + 4 + 4 + 4 + 1,
        seeds = b"album", minter.key().as_ref(),
        bump
    )]
    pub album: Account<'info, Album>,
    /// CHECK: Compressed NFT asset account
    pub asset: AccountInfo<'info>,
    /// CHECK: Bubblegum program
    pub bubblegum_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSpike<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK: Recipient (no need to be signer)
    pub to: AccountInfo<'info>,
    #[account(mut)]
    pub moment: Account<'info, SpikeMoment>,
    #[account(mut)]
    pub from_album: Account<'info, Album>,
    #[account(
        init_if_needed,
        payer = from,
        space = 8 + 32 + 4 + 4 + 4 + 1,
        seeds = b"album", to.key().as_ref(),
        bump
    )]
    pub to_album: Account<'info, Album>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnSpike<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub moment: Account<'info, SpikeMoment>,
    #[account(mut)]
    pub album: Account<'info, Album>,
}

// ===== Errors =====

#[error_code]
pub enum SpikesError {
    #[msg("Description too long (max 200 chars)")]
    DescriptionTooLong,
    #[msg("Spike not significant enough (>10% required)")]
    NotSignificantEnough,
    #[msg("Not the owner of this moment")]
    NotOwner,
    #[msg("Math overflow")]
    Overflow,
}
