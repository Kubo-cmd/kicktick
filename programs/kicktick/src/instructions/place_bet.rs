// place_bet — bet native SOL on a round side (YES/NO/ABSTAIN).

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(fixture_id: i64, round_id: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [MATCH_SEED, &fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    /// CHECK: system-owned vault, validated by seeds.
    #[account(
        mut,
        seeds = [MATCH_VAULT_SEED, match_pda.key().as_ref()],
        bump = match_pda.vault_bump
    )]
    pub match_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = Position::SIZE,
        seeds = [POSITION_SEED, &fixture_id.to_le_bytes(), &round_id.to_le_bytes(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PlaceBet>,
    fixture_id: i64,
    round_id: u64,
    side: u8,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, KicktickError::ZeroAmount);
    require!(side <= 2, KicktickError::InvalidSide);

    let now = Clock::get()?.unix_timestamp;
    let round = &mut ctx.accounts.round;
    require!(round.status == RoundStatus::Open, KicktickError::RoundNotOpen);
    require!(now < round.expires_at, KicktickError::RoundExpired);

    // Transfer the stake into the match vault.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.bettor.to_account_info(),
                to: ctx.accounts.match_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let match_pda = &mut ctx.accounts.match_pda;
    match_pda.total_deposited = match_pda
        .total_deposited
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;

    match side {
        0 => round.total_yes = round.total_yes.checked_add(amount).ok_or(KicktickError::Overflow)?,
        1 => round.total_no = round.total_no.checked_add(amount).ok_or(KicktickError::Overflow)?,
        _ => {
            round.total_abstain = round
                .total_abstain
                .checked_add(amount)
                .ok_or(KicktickError::Overflow)?
        }
    }

    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.bettor.key();
    position.fixture_id = fixture_id;
    position.round_id = round_id;
    position.side = side;
    position.amount = position
        .amount
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;
    position.claimed = false;
    Ok(())
}
