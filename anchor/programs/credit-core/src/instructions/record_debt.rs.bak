use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::{Config, UserPosition};
use crate::utils::{get_pyth_price, calculate_borrow_index};

#[derive(Accounts)]
pub struct RecordDebt<'info> {
    #[account(
        mut,
        seeds = [USER_POSITION_SEED, owner.key().as_ref()],
        bump,
        constraint = user_position.is_initialized @ crate::errors::CreditError::PositionAlreadyInitialized
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    
    /// The owner of the position (card holder)
    /// CHECK: We verify this matches the position owner
    pub owner: UncheckedAccount<'info>,
    
    /// Backend authority that can record debt
    /// This should be a backend service wallet that processes card transactions
    #[account(
        constraint = backend_authority.key() == config.admin @ crate::errors::CreditError::Unauthorized
    )]
    pub backend_authority: Signer<'info>,
    
    /// Pyth oracle for jitoSOL/USD price
    /// CHECK: Validated in handler
    pub jito_sol_oracle: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RecordDebt>, usdc_amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Verify owner matches position
    require!(
        ctx.accounts.owner.key() == user_position.owner,
        crate::errors::CreditError::Unauthorized
    );
    
    // Validate amount
    require!(usdc_amount > 0, crate::errors::CreditError::AmountTooSmall);
    
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
        user_position.borrow_index_snapshot = config.global_borrow_index;
        0
    };
    
    // Calculate new debt
    let new_debt = current_debt
        .checked_add(usdc_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // Get current price and check health factor after new debt
    let jito_sol_price = get_pyth_price(
        &ctx.accounts.jito_sol_oracle.to_account_info(),
        &clock,
        MAX_ORACLE_STALENESS_SLOTS
    )?;
    
    // Check if new debt would exceed credit limit
    let max_borrow = crate::utils::calculate_max_borrow(
        user_position.collateral_amount,
        jito_sol_price,
        config.ltv_max_bps
    )?;
    
    require!(
        new_debt <= max_borrow,
        crate::errors::CreditError::DebtLimitExceeded
    );
    
    // Check health factor with new debt
    let health_factor = user_position.calculate_health_factor(
        jito_sol_price,
        config.liquidation_threshold_bps,
        new_debt
    )?;
    
    // Require health factor to be above buffer (1.10)
    require!(
        health_factor >= HEALTH_FACTOR_BUFFER_BPS as u64,
        crate::errors::CreditError::HealthFactorTooLow
    );
    
    // Update position
    user_position.debt_usdc = new_debt;
    user_position.lifetime_borrows = user_position.lifetime_borrows
        .checked_add(usdc_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    
    // Update global debt tracking
    config.total_debt_usdc = config.total_debt_usdc
        .checked_add(usdc_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    msg!("Recorded debt of {} USDC for user: {}", usdc_amount, user_position.owner);
    msg!("New debt: {} USDC, Health factor: {}", new_debt, health_factor);
    
    // Emit event for indexers
    emit!(DebtRecorded {
        user: user_position.owner,
        amount: usdc_amount,
        new_total_debt: new_debt,
        health_factor,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct DebtRecorded {
    pub user: Pubkey,
    pub amount: u64,
    pub new_total_debt: u64,
    pub health_factor: u64,
    pub timestamp: i64,
} 