use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, UserPosition};
use crate::utils::{get_pyth_price, calculate_max_borrow, calculate_borrow_index};

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
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
    
    /// User's jitoSOL token account
    #[account(
        mut,
        constraint = user_jito_sol_account.owner == owner.key() @ crate::errors::CreditError::Unauthorized,
        constraint = user_jito_sol_account.mint == config.jito_sol_mint @ crate::errors::CreditError::InvalidCollateralMint
    )]
    pub user_jito_sol_account: Account<'info, TokenAccount>,
    
    /// Program's jitoSOL vault
    #[account(
        mut,
        seeds = [VAULT_SEED, config.jito_sol_mint.as_ref()],
        bump,
        token::mint = config.jito_sol_mint,
        token::authority = vault_authority
    )]
    pub vault_jito_sol_account: Account<'info, TokenAccount>,
    
    /// PDA authority for the vault
    /// CHECK: This is the PDA that has authority over the vault
    #[account(
        seeds = [VAULT_AUTHORITY_SEED],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Pyth oracle for jitoSOL/USD price
    /// CHECK: Validated in handler
    pub jito_sol_oracle: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Validate minimum deposit amount
    require!(amount >= MIN_DEPOSIT_AMOUNT, crate::errors::CreditError::AmountTooSmall);
    
    // Update global interest index
    let time_elapsed = clock.unix_timestamp.saturating_sub(config.last_update_timestamp);
    config.global_borrow_index = calculate_borrow_index(
        config.global_borrow_index,
        config.interest_rate_bps,
        time_elapsed
    )?;
    config.last_update_timestamp = clock.unix_timestamp;
    
    // Update user's debt with latest interest
    if user_position.debt_usdc > 0 {
        user_position.debt_usdc = user_position.calculate_debt_with_interest(config.global_borrow_index)?;
        user_position.borrow_index_snapshot = config.global_borrow_index;
    }
    
    // Transfer jitoSOL from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_jito_sol_account.to_account_info(),
        to: ctx.accounts.vault_jito_sol_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;
    
    // Update position
    user_position.collateral_amount = user_position.collateral_amount
        .checked_add(amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    
    // Update global collateral tracking
    config.total_collateral = config.total_collateral
        .checked_add(amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // Get current price and update credit limit
    let jito_sol_price = get_pyth_price(
        &ctx.accounts.jito_sol_oracle.to_account_info(),
        &clock,
        MAX_ORACLE_STALENESS_SLOTS
    )?;
    
    let new_credit_limit = calculate_max_borrow(
        user_position.collateral_amount,
        jito_sol_price,
        config.ltv_max_bps
    )?;
    user_position.credit_limit = new_credit_limit;
    
    msg!("Deposited {} jitoSOL for user: {}", amount, ctx.accounts.owner.key());
    msg!("New collateral: {}, Credit limit: {} USDC", 
        user_position.collateral_amount, 
        user_position.credit_limit
    );
    
    Ok(())
} 