use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, UserPosition};
use crate::utils::calculate_borrow_index;

#[derive(Accounts)]
pub struct RepayUsdc<'info> {
    #[account(
        mut,
        seeds = [USER_POSITION_SEED, owner.key().as_ref()],
        bump,
        constraint = user_position.owner == owner.key() @ crate::errors::CreditError::Unauthorized,
        constraint = user_position.is_initialized @ crate::errors::CreditError::PositionAlreadyInitialized
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    
    /// User's USDC token account
    #[account(
        mut,
        constraint = user_usdc_account.owner == owner.key() @ crate::errors::CreditError::Unauthorized,
        constraint = user_usdc_account.mint == config.usdc_mint @ crate::errors::CreditError::InvalidCollateralMint
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    /// Program's USDC treasury account
    #[account(
        mut,
        seeds = [VAULT_SEED, config.usdc_mint.as_ref()],
        bump,
        token::mint = config.usdc_mint,
        token::authority = vault_authority
    )]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    
    /// PDA authority for the vault
    /// CHECK: This is the PDA that has authority over the vault
    #[account(
        seeds = [VAULT_AUTHORITY_SEED],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RepayUsdc>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Validate repayment amount
    require!(amount >= MIN_REPAY_AMOUNT, crate::errors::CreditError::AmountTooSmall);
    
    // Update global interest index
    let time_elapsed = clock.unix_timestamp.saturating_sub(config.last_update_timestamp);
    config.global_borrow_index = calculate_borrow_index(
        config.global_borrow_index,
        config.interest_rate_bps,
        time_elapsed
    )?;
    config.last_update_timestamp = clock.unix_timestamp;
    
    // Calculate current debt with interest
    let current_debt = user_position.calculate_debt_with_interest(config.global_borrow_index)?;
    require!(current_debt > 0, crate::errors::CreditError::RepayExceedsDebt);
    
    // Calculate actual repayment amount (can't exceed debt)
    let actual_repay_amount = amount.min(current_debt);
    
    // Transfer USDC from user to treasury
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_usdc_account.to_account_info(),
        to: ctx.accounts.treasury_usdc_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, actual_repay_amount)?;
    
    // Update user position
    let new_debt = current_debt
        .checked_sub(actual_repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    user_position.debt_usdc = new_debt;
    user_position.borrow_index_snapshot = config.global_borrow_index;
    user_position.lifetime_repayments = user_position.lifetime_repayments
        .checked_add(actual_repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    
    // Update global debt tracking
    config.total_debt_usdc = config.total_debt_usdc
        .checked_sub(actual_repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    msg!("Repaid {} USDC for user: {}", actual_repay_amount, ctx.accounts.owner.key());
    msg!("Previous debt: {} USDC, New debt: {} USDC", current_debt, new_debt);
    
    // Emit event for indexers
    emit!(DebtRepaid {
        user: user_position.owner,
        amount: actual_repay_amount,
        remaining_debt: new_debt,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct DebtRepaid {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_debt: u64,
    pub timestamp: i64,
} 