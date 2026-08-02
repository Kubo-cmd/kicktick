// init_match — create a Match_ PDA + its system-owned MatchVault for a fixture.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(fixture_id: i64)]
pub struct InitMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == creator.key() @ KicktickError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = Match_::SIZE,
        seeds = [MATCH_SEED, &fixture_id.to_le_bytes()],
        bump
    )]
    pub match_pda: Account<'info, Match_>,

    /// System-owned lamport vault. No data; holds the match betting pool.
    /// CHECK: created via CPI if empty; validated by seeds.
    #[account(
        mut,
        seeds = [MATCH_VAULT_SEED, match_pda.key().as_ref()],
        bump
    )]
    pub match_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitMatch>,
    fixture_id: i64,
    home_team: String,
    away_team: String,
) -> Result<()> {
    require!(fixture_id > 0, KicktickError::InvalidFixture);
    require!(
        home_team.len() <= Match_::MAX_TEAM_LEN && away_team.len() <= Match_::MAX_TEAM_LEN,
        KicktickError::TeamNameTooLong
    );

    let match_pda = &mut ctx.accounts.match_pda;
    let vault_bump = ctx.bumps.match_vault;

    // Create the vault system account if it has no lamports yet.
    if ctx.accounts.match_vault.lamports() == 0 {
        let match_key = match_pda.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            MATCH_VAULT_SEED,
            match_key.as_ref(),
            &[vault_bump],
        ]];
        let rent = Rent::get()?.minimum_balance(0);
        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.match_vault.to_account_info(),
                },
                signer_seeds,
            ),
            rent,
            0,
            &ctx.accounts.system_program.key(),
        )?;
    }

    match_pda.fixture_id = fixture_id;
    match_pda.status = MatchStatus::Pending;
    match_pda.home_team = home_team;
    match_pda.away_team = away_team;
    match_pda.competition_id = 0;
    match_pda.vault_bump = vault_bump;
    match_pda.round_counter = 0;
    match_pda.total_deposited = 0;
    match_pda.total_sponsored = 0;
    match_pda.created_at = Clock::get()?.unix_timestamp;
    Ok(())
}
