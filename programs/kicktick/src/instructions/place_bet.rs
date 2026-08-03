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
    require!(
        round.status == RoundStatus::Open,
        KicktickError::RoundNotOpen
    );
    require!(now < round.expires_at, KicktickError::RoundExpired);
    require!(
        betting_window_open(
            now,
            round.expires_at,
            round.params.lock_seconds,
            round.params.deadline_seconds,
        )?,
        KicktickError::RoundLocked
    );

    // One PDA represents one bettor/round position. Refuse side changes before
    // transferring funds so an old losing stake can never be relabelled.
    let position = &ctx.accounts.position;
    require!(
        position.amount == 0 || position.version == Position::CURRENT_VERSION,
        KicktickError::UnsupportedPositionVersion
    );
    require!(
        position_side_matches(position.amount, position.side, side),
        KicktickError::PositionSideMismatch
    );

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
        0 => {
            round.total_yes = round
                .total_yes
                .checked_add(amount)
                .ok_or(KicktickError::Overflow)?
        }
        1 => {
            round.total_no = round
                .total_no
                .checked_add(amount)
                .ok_or(KicktickError::Overflow)?
        }
        _ => {
            round.total_abstain = round
                .total_abstain
                .checked_add(amount)
                .ok_or(KicktickError::Overflow)?
        }
    }

    let position = &mut ctx.accounts.position;
    if position.amount == 0 {
        position.owner = ctx.accounts.bettor.key();
        position.fixture_id = fixture_id;
        position.round_id = round_id;
        position.side = side;
    }
    position.version = Position::CURRENT_VERSION;
    position.amount = position
        .amount
        .checked_add(amount)
        .ok_or(KicktickError::Overflow)?;
    position.claimed = false;
    Ok(())
}

fn position_side_matches(existing_amount: u64, existing_side: u8, new_side: u8) -> bool {
    existing_amount == 0 || existing_side == new_side
}

fn betting_window_open(
    now: i64,
    expires_at: i64,
    lock_seconds: i64,
    deadline_seconds: i64,
) -> Result<bool> {
    let opened_at = expires_at
        .checked_sub(deadline_seconds)
        .ok_or(KicktickError::Overflow)?;
    let locks_at = opened_at
        .checked_add(lock_seconds)
        .ok_or(KicktickError::Overflow)?;
    Ok(now < locks_at)
}

#[cfg(test)]
mod tests {
    use super::{betting_window_open, position_side_matches};

    #[test]
    fn empty_position_accepts_any_side() {
        assert!(position_side_matches(0, 0, 2));
    }

    #[test]
    fn funded_position_accepts_only_its_existing_side() {
        assert!(position_side_matches(10, 1, 1));
        assert!(!position_side_matches(10, 1, 0));
        assert!(!position_side_matches(10, 1, 2));
    }

    #[test]
    fn betting_closes_at_the_configured_lock_time() {
        let expires_at = 1_300;
        assert!(betting_window_open(1_014, expires_at, 15, 300).unwrap());
        assert!(!betting_window_open(1_015, expires_at, 15, 300).unwrap());
    }
}
