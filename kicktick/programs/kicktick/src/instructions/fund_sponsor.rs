use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

// ===== fund_sponsor =====

#[derive(Accounts)]
pub struct FundSponsor<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        init_if_needed,
        payer = sponsor,
        space = SponsorVault::LEN,
        seeds = [SEED_SPONSOR_VAULT],
        bump
    )]
    pub sponsor_vault: Account<'info, SponsorVault>,

    /// CHECK: vault PDA — system-owned.
    #[account(mut, seeds = [SEED_MATCH_VAULT, match_pda.key().as_ref()], bump = match_pda.vault_bump)]
    pub match_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn fund_sponsor_handler(ctx: Context<FundSponsor>, amount: u64) -> Result<()> {
    require!(amount > 0, KickTickError::ZeroAmount);

    // Transfer SOL from sponsor to match vault
    anchor_lang::system_program::transfer(
        CpiContext::new(
            *ctx.accounts.system_program.key,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sponsor.to_account_info(),
                to: ctx.accounts.match_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update global sponsor vault
    let vault = &mut ctx.accounts.sponsor_vault;
    vault.total_balance = vault.total_balance.checked_add(amount).ok_or(KickTickError::Overflow)?;
    vault.bump = ctx.bumps.sponsor_vault;

    Ok(())
}

// ===== sponsor_round =====

#[derive(Accounts)]
pub struct SponsorRound<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [SEED_SPONSOR_VAULT],
        bump = sponsor_vault.bump,
    )]
    pub sponsor_vault: Account<'info, SponsorVault>,

    pub system_program: Program<'info, System>,
}

pub fn sponsor_round_handler(ctx: Context<SponsorRound>, amount: u64) -> Result<()> {
    require!(amount > 0, KickTickError::ZeroAmount);

    let vault = &mut ctx.accounts.sponsor_vault;
    require!(
        vault.total_balance >= amount,
        KickTickError::InsufficientLiquidity
    );

    vault.total_balance = vault.total_balance.checked_sub(amount).ok_or(KickTickError::Overflow)?;
    vault.allocated = vault.allocated.checked_add(amount).ok_or(KickTickError::Overflow)?;

    // Track total sponsorship on match
    let match_pda = &mut ctx.accounts.match_pda;
    match_pda.total_sponsored = match_pda.total_sponsored.checked_add(amount).ok_or(KickTickError::Overflow)?;

    Ok(())
}
