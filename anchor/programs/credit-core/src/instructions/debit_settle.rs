use anchor_lang::prelude::*;

use crate::state::{DebitAccount, Config};
use crate::errors::CreditError;

/// Settle a debit card transaction (commit reserved funds)
pub fn handler(ctx: Context<DebitSettle>, amount: u64) -> Result<()> {
    let debit_account = &mut ctx.accounts.debit_account;
    let clock = Clock::get()?;
    
    // Commit the reserved funds
    debit_account.commit_reserved(amount, clock.unix_timestamp)?;
    
    msg!("Settled {} USDC debit transaction", amount);
    msg!("Lifetime spent: {}", debit_account.lifetime_spent);
    msg!("Daily spent: {}", debit_account.daily_spent);
    msg!("Monthly spent: {}", debit_account.monthly_spent);
    
    Ok(())
}

#[derive(Accounts)]
pub struct DebitSettle<'info> {
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


