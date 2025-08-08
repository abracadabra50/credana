use anchor_lang::prelude::*;

use crate::state::{DebitAccount, Config};
use crate::errors::CreditError;

/// Record a debit card spend (called by backend after authorization)
pub fn handler(ctx: Context<DebitSpend>, amount: u64) -> Result<()> {
    let debit_account = &mut ctx.accounts.debit_account;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    
    // Check if protocol is paused
    require!(!config.is_paused, CreditError::ProtocolPaused);
    
    // Check if account is active
    require!(debit_account.status == 1, CreditError::AccountNotActive);
    
    // Check if spending is allowed
    require!(
        debit_account.can_spend(amount, clock.unix_timestamp)?,
        CreditError::SpendingNotAllowed
    );
    
    // Reserve funds for this transaction
    debit_account.reserve_funds(amount)?;
    
    msg!("Reserved {} USDC for debit spend", amount);
    msg!("Available: {}, Reserved: {}", 
        debit_account.usdc_available, 
        debit_account.usdc_reserved
    );
    
    Ok(())
}

#[derive(Accounts)]
pub struct DebitSpend<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [b"config"],
        bump,
        constraint = authority.key() == config.admin @ CreditError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        seeds = [b"debit", debit_account.owner.as_ref()],
        bump
    )]
    pub debit_account: Account<'info, DebitAccount>,
}


