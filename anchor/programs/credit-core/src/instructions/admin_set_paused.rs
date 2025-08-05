use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::Config;

#[derive(Accounts)]
pub struct AdminSetPaused<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
        constraint = config.admin == admin.key() @ crate::errors::CreditError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<AdminSetPaused>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    // Update paused state
    config.paused = paused;
    
    msg!("Protocol paused state set to: {}", paused);
    
    // Emit event for monitoring
    emit!(ProtocolPausedStateChanged {
        admin: ctx.accounts.admin.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct ProtocolPausedStateChanged {
    pub admin: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
} 