// fund_sponsor + sponsor_round — global sponsor liquidity.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct FundSponsor<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    #[account(
        init_if_needed,
        payer = sponsor,
        space = SponsorVault::SIZE,
        seeds = [SPONSOR_VAULT_SEED],
        bump
    )]
    pub sponsor_vault: Account<'info, SponsorVault>,

    pub system_program: Program<'info, System>,
}

pub fn fund_sponsor(_ctx: Context<FundSponsor>, _amount: u64) -> Result<()> {
    // A global multi-donor vault has no contribution ledger or recovery path yet.
    // Reject deposits rather than accepting SOL that cannot be safely reclaimed.
    err!(KicktickError::SponsorFlowDisabled)
}

#[derive(Accounts)]
pub struct SponsorRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == authority.key() @ KicktickError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SPONSOR_VAULT_SEED],
        bump = sponsor_vault.bump,
    )]
    pub sponsor_vault: Account<'info, SponsorVault>,

    #[account(
        mut,
        seeds = [MATCH_SEED, &match_pda.fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    /// CHECK: canonical system-owned vault for this match PDA.
    #[account(
        mut,
        seeds = [MATCH_VAULT_SEED, match_pda.key().as_ref()],
        bump = match_pda.vault_bump
    )]
    pub match_vault: UncheckedAccount<'info>,
}

pub fn sponsor_round(_ctx: Context<SponsorRound>, _amount: u64) -> Result<()> {
    err!(KicktickError::SponsorFlowDisabled)
}
