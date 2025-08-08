use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, UserPosition};
use crate::utils::{get_pyth_price, calculate_borrow_index, calculate_liquidation_bonus, usdc_to_collateral};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        mut,
        seeds = [USER_POSITION_SEED, user_being_liquidated.key().as_ref()],
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
    
    /// The user being liquidated
    /// CHECK: Validated against position owner
    pub user_being_liquidated: UncheckedAccount<'info>,
    
    /// Liquidator's USDC token account
    #[account(
        mut,
        constraint = liquidator_usdc_account.owner == liquidator.key() @ crate::errors::CreditError::Unauthorized,
        constraint = liquidator_usdc_account.mint == config.usdc_mint @ crate::errors::CreditError::InvalidCollateralMint
    )]
    pub liquidator_usdc_account: Account<'info, TokenAccount>,
    
    /// Liquidator's jitoSOL token account (to receive collateral)
    #[account(
        mut,
        constraint = liquidator_jito_sol_account.owner == liquidator.key() @ crate::errors::CreditError::Unauthorized,
        constraint = liquidator_jito_sol_account.mint == config.jito_sol_mint @ crate::errors::CreditError::InvalidCollateralMint
    )]
    pub liquidator_jito_sol_account: Account<'info, TokenAccount>,
    
    /// Program's USDC treasury account
    #[account(
        mut,
        seeds = [VAULT_SEED, config.usdc_mint.as_ref()],
        bump,
        token::mint = config.usdc_mint,
        token::authority = vault_authority
    )]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    
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
    pub liquidator: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;
    
    // Check protocol is not paused
    require!(!config.paused, crate::errors::CreditError::ProtocolPaused);
    
    // Verify user being liquidated matches position
    require!(
        ctx.accounts.user_being_liquidated.key() == user_position.owner,
        crate::errors::CreditError::Unauthorized
    );
    
    // Validate repay amount
    require!(repay_amount > 0, crate::errors::CreditError::AmountTooSmall);
    
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
    
    // Get current price
    let jito_sol_price = get_pyth_price(
        &ctx.accounts.jito_sol_oracle.to_account_info(),
        &clock,
        MAX_ORACLE_STALENESS_SLOTS
    )?;
    
    // Check if position is unhealthy (can be liquidated)
    let health_factor = user_position.calculate_health_factor(
        jito_sol_price,
        config.liquidation_threshold_bps,
        current_debt
    )?;
    
    require!(
        health_factor < BPS_PRECISION, // Health factor < 1.0
        crate::errors::CreditError::PositionHealthy
    );
    
    // Calculate maximum liquidation amount (can liquidate up to 50% of debt in one go)
    let max_liquidation = current_debt / 2;
    let actual_repay_amount = repay_amount.min(max_liquidation).min(current_debt);
    
    // Calculate collateral to seize (repay amount + bonus)
    let bonus_amount = calculate_liquidation_bonus(actual_repay_amount, config.liquidation_bonus_bps)?;
    let total_value_to_seize = actual_repay_amount
        .checked_add(bonus_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    let collateral_to_seize = usdc_to_collateral(total_value_to_seize, jito_sol_price)?;
    
    // Ensure we don't seize more collateral than available
    let actual_collateral_seized = collateral_to_seize.min(user_position.collateral_amount);
    
    // Transfer USDC from liquidator to treasury
    let cpi_accounts = Transfer {
        from: ctx.accounts.liquidator_usdc_account.to_account_info(),
        to: ctx.accounts.treasury_usdc_account.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, actual_repay_amount)?;
    
    // Transfer collateral from vault to liquidator
    let vault_authority_bump = ctx.bumps.vault_authority;
    let vault_authority_seeds = &[VAULT_AUTHORITY_SEED, &[vault_authority_bump]];
    let signer_seeds = &[&vault_authority_seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_jito_sol_account.to_account_info(),
        to: ctx.accounts.liquidator_jito_sol_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, actual_collateral_seized)?;
    
    // Update user position
    let new_debt = current_debt
        .checked_sub(actual_repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    let new_collateral = user_position.collateral_amount
        .checked_sub(actual_collateral_seized)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    user_position.debt_usdc = new_debt;
    user_position.collateral_amount = new_collateral;
    user_position.borrow_index_snapshot = config.global_borrow_index;
    user_position.liquidation_count += 1;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    
    // Update global tracking
    config.total_debt_usdc = config.total_debt_usdc
        .checked_sub(actual_repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    config.total_collateral = config.total_collateral
        .checked_sub(actual_collateral_seized)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    msg!("Liquidated position of user: {}", user_position.owner);
    msg!("Repaid: {} USDC, Seized: {} jitoSOL", actual_repay_amount, actual_collateral_seized);
    msg!("Remaining debt: {} USDC, Remaining collateral: {} jitoSOL", new_debt, new_collateral);
    
    // Emit event for indexers
    emit!(PositionLiquidated {
        user: user_position.owner,
        liquidator: ctx.accounts.liquidator.key(),
        repay_amount: actual_repay_amount,
        collateral_seized: actual_collateral_seized,
        remaining_debt: new_debt,
        remaining_collateral: new_collateral,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct PositionLiquidated {
    pub user: Pubkey,
    pub liquidator: Pubkey,
    pub repay_amount: u64,
    pub collateral_seized: u64,
    pub remaining_debt: u64,
    pub remaining_collateral: u64,
    pub timestamp: i64,
} 