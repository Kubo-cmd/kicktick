// fund_sponsor + sponsor_round — global sponsor liquidity.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

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

    /// CHECK: match vault receiving sponsor liquidity (system-owned).
    #[account(mut)]
    pub match_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn fund_sponsor(ctx: Context<FundSponsor>, amount: u64) -> Result<()> {
    require!(amount > 0, KicktickError::InvalidAmount);
    let vault = &mut ctx.accounts.sponsor_vault;
    if vault.bump == 0 {
        vault.bump = ctx.bumps.sponsor_vault;
    }

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sponsor.to_account_info(),
                to: ctx.accounts.match_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    vault.total_balance = vault
        .total_balance
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct SponsorRound<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    #[account(
        mut,
        seeds = [SPONSOR_VAULT_SEED],
        bump = sponsor_vault.bump,
    )]
    pub sponsor_vault: Account<'info, SponsorVault>,

    #[account(mut)]
    pub match_pda: Account<'info, Match_>,
}

pub fn sponsor_round(ctx: Context<SponsorRound>, amount: u64) -> Result<()> {
    require!(amount > 0, KicktickError::InvalidAmount);
    let vault = &mut ctx.accounts.sponsor_vault;
    require!(
        vault.total_balance.saturating_sub(vault.allocated) >= amount,
        KicktickError::InsufficientSponsorLiquidity
    );

    vault.allocated = vault
        .allocated
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;
    ctx.accounts.match_pda.total_sponsored = ctx
        .accounts
        .match_pda
        .total_sponsored
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;
    Ok(())
}
