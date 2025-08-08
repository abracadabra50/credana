use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::DebitAccount;
use crate::errors::CreditError;

/// Deposit USDC into debit account
pub fn handler(ctx: Context<DebitDeposit>, amount: u64) -> Result<()> {
    let debit_account = &mut ctx.accounts.debit_account;
    let clock = Clock::get()?;
    
    // Initialize if first deposit
    if !debit_account.is_initialized {
        debit_account.owner = ctx.accounts.user.key();
        debit_account.daily_limit = 1000_000_000; // $1000 default
        debit_account.monthly_limit = 10000_000_000; // $10,000 default
        debit_account.status = 1; // Active
        debit_account.is_initialized = true;
        debit_account.last_daily_reset = clock.unix_timestamp;
        debit_account.last_monthly_reset = clock.unix_timestamp;
    }
    
    // Transfer USDC from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_usdc_account.to_account_info(),
        to: ctx.accounts.vault_usdc_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Update debit account balances
    debit_account.usdc_deposited = debit_account.usdc_deposited
        .checked_add(amount)
        .ok_or(error!(CreditError::MathOverflow))?;
        
    debit_account.usdc_available = debit_account.usdc_available
        .checked_add(amount)
        .ok_or(error!(CreditError::MathOverflow))?;
        
    debit_account.lifetime_deposits = debit_account.lifetime_deposits
        .checked_add(amount)
        .ok_or(error!(CreditError::MathOverflow))?;
    
    msg!("Deposited {} USDC to debit account", amount);
    msg!("New available balance: {}", debit_account.usdc_available);
    
    Ok(())
}

#[derive(Accounts)]
pub struct DebitDeposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = DebitAccount::LEN,
        seeds = [b"debit", user.key().as_ref()],
        bump
    )]
    pub debit_account: Account<'info, DebitAccount>,
    
    #[account(
        mut,
        constraint = user_usdc_account.owner == user.key() @ CreditError::InvalidOwner,
        constraint = user_usdc_account.mint == anchor_spl::token::spl_token::native_mint::ID @ CreditError::InvalidMint
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"vault", b"usdc"],
        bump
    )]
    pub vault_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


