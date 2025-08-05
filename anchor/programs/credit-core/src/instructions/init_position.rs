use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::{Config, UserPosition};

#[derive(Accounts)]
pub struct InitPosition<'info> {
    #[account(
        init,
        payer = owner,
        space = UserPosition::LEN,
        seeds = [USER_POSITION_SEED, owner.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPosition>) -> Result<()> {
    let user_position = &mut ctx.accounts.user_position;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Initialize user position
    user_position.owner = ctx.accounts.owner.key();
    user_position.collateral_mint = config.jito_sol_mint; // MVP only supports jitoSOL
    user_position.collateral_amount = 0;
    user_position.debt_usdc = 0;
    user_position.borrow_index_snapshot = config.global_borrow_index;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    user_position.lifetime_borrows = 0;
    user_position.lifetime_repayments = 0;
    user_position.liquidation_count = 0;
    user_position.is_initialized = true;
    user_position.credit_limit = 0; // Will be set based on collateral deposits
    user_position._reserved = [0; 16];
    
    msg!("User position initialized for: {}", ctx.accounts.owner.key());
    
    Ok(())
} 