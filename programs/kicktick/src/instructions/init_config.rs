// init_config — one-time global Config PDA bootstrap.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ KicktickError::Unauthorized
    )]
    pub program: Program<'info, crate::program::Kicktick>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ KicktickError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,

    #[account(
        init,
        payer = admin,
        space = Config::SIZE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitConfig>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.txoracle_program_id = TXORACLE_PROGRAM_ID;
    config.daily_scores_merkle_roots = Pubkey::default();
    config.finality_delay = FINALITY_DELAY_SECONDS;
    config.min_liquidity = MIN_ROUND_LIQUIDITY;
    config.bump = ctx.bumps.config;
    Ok(())
}
