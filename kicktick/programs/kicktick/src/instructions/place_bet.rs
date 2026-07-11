use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::KickTickError;

#[derive(Accounts)]
#[instruction(fixture_id: i64, round_id: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MATCH, &match_pda.fixture_id.to_le_bytes()],
        bump = match_pda.bump,
    )]
    pub match_pda: Account<'info, Match_>,

    /// CHECK: vault PDA — system-owned, seeds verified via match_pda keys.
    #[account(mut, seeds = [SEED_MATCH_VAULT, match_pda.key().as_ref()], bump = match_pda.vault_bump)]
    pub match_vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_ROUND, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Position::LEN,
        seeds = [SEED_POSITION, &fixture_id.to_le_bytes(), &round_id.to_le_bytes(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceBet>, fixture_id: i64, round_id: u64, side: u8, amount: u64) -> Result<()> {
    require!(amount > 0, KickTickError::ZeroAmount);
    require!(side <= 2, KickTickError::InvalidSide);

    let round = &mut ctx.accounts.round;
    require!(round.status == RoundStatus::Open, KickTickError::RoundNotOpen);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < round.expires_at, KickTickError::DeadlinePassed);

    // Transfer SOL from bettor to vault
    anchor_lang::system_program::transfer(
        CpiContext::new(
            *ctx.accounts.system_program.key,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.bettor.to_account_info(),
                to: ctx.accounts.match_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let match_pda = &mut ctx.accounts.match_pda;
    require!(match_pda.fixture_id == fixture_id, KickTickError::InvalidFixtureId);
    match_pda.total_deposited = match_pda.total_deposited.checked_add(amount).ok_or(KickTickError::Overflow)?;

    match side {
        0 => round.total_yes = round.total_yes.checked_add(amount).ok_or(KickTickError::Overflow)?,
        1 => round.total_no = round.total_no.checked_add(amount).ok_or(KickTickError::Overflow)?,
        2 => round.total_abstain = round.total_abstain.checked_add(amount).ok_or(KickTickError::Overflow)?,
        _ => return Err(KickTickError::InvalidSide.into()),
    }

    // Create/update position
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.bettor.key();
    position.fixture_id = fixture_id;
    position.round_id = round_id;
    position.side = side;
    position.amount = position.amount.checked_add(amount).ok_or(KickTickError::Overflow)?;
    position.claimed = false;
    position.bump = ctx.bumps.position;

    Ok(())
}
