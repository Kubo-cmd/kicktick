// claim — claim_winnings (pro-rata payout) + refund_bet (cancelled/voided).

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(fixture_id: i64, round_id: u64)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        seeds = [MATCH_SEED, &fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    #[account(
        mut,
        seeds = [ROUND_SEED, match_pda.key().as_ref(), &round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [POSITION_SEED, &fixture_id.to_le_bytes(), &round_id.to_le_bytes(), winner.key().as_ref()],
        bump,
        constraint = position.owner == winner.key() @ KicktickError::Unauthorized,
        constraint = !position.claimed @ KicktickError::AlreadyClaimed,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: system-owned vault (payer), validated by seeds.
    #[account(
        mut,
        seeds = [MATCH_VAULT_SEED, match_pda.key().as_ref()],
        bump = match_pda.vault_bump
    )]
    pub match_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn claim_winnings_handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let round = &ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    // Void / cancelled → full refund.
    let is_void = round.winner == Some(0)
        || round.outcome == RoundOutcome::Cancelled
        || round.status == RoundStatus::Voided
        || round.status == RoundStatus::Cancelled;

    let payout = if is_void {
        position.amount
    } else {
        // Pre-upgrade positions may aggregate stakes from multiple sides because
        // the old producer overwrote `side`. They remain readable for principal
        // refunds, but can never enter proportional winner accounting.
        require!(
            position_version_allows_payout(position.version, false),
            KicktickError::UnsupportedPositionVersion
        );
        require!(
            round.status == RoundStatus::Settled,
            KicktickError::RoundNotSettled
        );
        let winner_side = round.winner.ok_or(KicktickError::RoundNotSettled)?;
        // position side mapping: 0=YES->winner 1, 1=NO->winner 2, 2=abstain->winner 3.
        let expected = match position.side {
            0 => 1u8,
            1 => 2u8,
            _ => 3u8,
        };
        require!(winner_side == expected, KicktickError::NotWinningSide);

        let total_pool = round
            .total_yes
            .checked_add(round.total_no)
            .and_then(|v| v.checked_add(round.total_abstain))
            .ok_or(KicktickError::Overflow)?;
        let winning_pool = match winner_side {
            1 => round.total_yes,
            2 => round.total_no,
            _ => round.total_abstain,
        };
        require!(winning_pool > 0, KicktickError::Overflow);
        require!(
            position_is_covered(position.amount, winning_pool),
            KicktickError::InvalidPositionAccounting
        );

        let computed = (position.amount as u128)
            .checked_mul(total_pool as u128)
            .ok_or(KicktickError::Overflow)?
            .checked_div(winning_pool as u128)
            .ok_or(KicktickError::Overflow)?;
        u64::try_from(computed).map_err(|_| KicktickError::Overflow)?
    };

    // Pay out of the match vault via PDA signer.
    let match_key = ctx.accounts.match_pda.key();
    let vault_bump = ctx.accounts.match_pda.vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[MATCH_VAULT_SEED, match_key.as_ref(), &[vault_bump]]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.match_vault.to_account_info(),
                to: ctx.accounts.winner.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    position.claimed = true;
    Ok(())
}

fn position_is_covered(position_amount: u64, winning_pool: u64) -> bool {
    position_amount <= winning_pool
}

fn position_version_allows_payout(version: u8, is_void: bool) -> bool {
    is_void || version == Position::CURRENT_VERSION
}

// refund_bet is the void/cancelled branch of claim_winnings; kept as a named
// entry point for IDL parity with the docs.
pub fn refund_bet_handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let round = &ctx.accounts.round;
    let is_void = round.winner == Some(0)
        || round.outcome == RoundOutcome::Cancelled
        || round.status == RoundStatus::Voided
        || round.status == RoundStatus::Cancelled;
    require!(is_void, KicktickError::RoundNotRefundable);
    claim_winnings_handler(ctx)
}

#[cfg(test)]
mod tests {
    use super::{position_is_covered, position_version_allows_payout};

    #[test]
    fn rejects_legacy_mixed_side_position_larger_than_winning_pool() {
        assert!(position_is_covered(10, 10));
        assert!(!position_is_covered(11, 1));
    }

    #[test]
    fn legacy_positions_are_refund_only() {
        assert!(position_version_allows_payout(255, true));
        assert!(!position_version_allows_payout(255, false));
        assert!(position_version_allows_payout(2, false));
    }
}
