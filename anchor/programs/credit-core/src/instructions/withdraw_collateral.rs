use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, UserPosition};
use crate::utils::{get_pyth_price, calculate_borrow_index};

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
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

pub fn handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Validate withdrawal amount
    require!(amount > 0, crate::errors::CreditError::AmountTooSmall);
    require!(
        amount <= user_position.collateral_amount, 
        crate::errors::CreditError::InsufficientCollateral
    );
    
    // Update global interest index
    let time_elapsed = clock.unix_timestamp.saturating_sub(config.last_update_timestamp);
    config.global_borrow_index = calculate_borrow_index(
        config.global_borrow_index,
        config.interest_rate_bps,
        time_elapsed
    )?;
    config.last_update_timestamp = clock.unix_timestamp;
    
    // Update user's debt with latest interest
    let current_debt = if user_position.debt_usdc > 0 {
        let debt_with_interest = user_position.calculate_debt_with_interest(config.global_borrow_index)?;
        user_position.debt_usdc = debt_with_interest;
        user_position.borrow_index_snapshot = config.global_borrow_index;
        debt_with_interest
    } else {
        0
    };
    
    // Calculate remaining collateral after withdrawal
    let remaining_collateral = user_position.collateral_amount
        .checked_sub(amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // If there's debt, check health factor after withdrawal
    if current_debt > 0 {
        // Get current price
        let jito_sol_price = get_pyth_price(
            &ctx.accounts.jito_sol_oracle.to_account_info(),
            &clock,
            MAX_ORACLE_STALENESS_SLOTS
        )?;
        
        // Create temporary position to check health
        let mut temp_position = user_position.clone();
        temp_position.collateral_amount = remaining_collateral;
        
        let health_factor = temp_position.calculate_health_factor(
            jito_sol_price,
            config.liquidation_threshold_bps,
            current_debt
        )?;
        
        // Require health factor to be above buffer (1.10)
        require!(
            health_factor >= HEALTH_FACTOR_BUFFER_BPS as u64,
            crate::errors::CreditError::HealthFactorTooLow
        );
    }
    
    // Transfer jitoSOL from vault to user
    let vault_authority_bump = ctx.bumps.vault_authority;
    let vault_authority_seeds = &[VAULT_AUTHORITY_SEED, &[vault_authority_bump]];
    let signer_seeds = &[&vault_authority_seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_jito_sol_account.to_account_info(),
        to: ctx.accounts.user_jito_sol_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)?;
    
    // Update position
    user_position.collateral_amount = remaining_collateral;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    
    // Update global collateral tracking
    config.total_collateral = config.total_collateral
        .checked_sub(amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // Update credit limit if needed
    if current_debt == 0 && remaining_collateral == 0 {
        user_position.credit_limit = 0;
    } else if remaining_collateral > 0 {
        let jito_sol_price = get_pyth_price(
            &ctx.accounts.jito_sol_oracle.to_account_info(),
            &clock,
            MAX_ORACLE_STALENESS_SLOTS
        )?;
        
        user_position.credit_limit = crate::utils::calculate_max_borrow(
            remaining_collateral,
            jito_sol_price,
            config.ltv_max_bps
        )?;
    }
    
    msg!("Withdrew {} jitoSOL for user: {}", amount, ctx.accounts.owner.key());
    msg!("Remaining collateral: {}, Credit limit: {} USDC", 
        user_position.collateral_amount, 
        user_position.credit_limit
    );
    
    Ok(())
} 