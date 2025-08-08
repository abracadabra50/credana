use anchor_lang::prelude::*;
use crate::state::{Config, UserPosition};
use crate::utils::calculate_borrow_index;
use crate::constants::*;

#[derive(Accounts)]
pub struct RepayUsdc<'info> {
    #[account(
        mut,
        seeds = [USER_POSITION_SEED, owner.key().as_ref()],
        bump,
        constraint = user_position.owner == owner.key() @ crate::errors::CreditError::Unauthorized
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// User's USDC token account (simplified for testing)
    /// CHECK: Simplified for testing
    pub user_usdc_account: UncheckedAccount<'info>,

    /// Treasury USDC account (simplified for testing)
    /// CHECK: Simplified for testing
    pub treasury_usdc_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Token program
    pub token_program: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RepayUsdc>, usdc_amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;

    // Update global interest index
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.last_update_timestamp = clock.unix_timestamp;

    // Calculate current debt with interest
    let current_debt = user_position.calculate_debt_with_interest(config.global_borrow_index)?;
    
    // Ensure not overpaying
    let repay_amount = usdc_amount.min(current_debt);

    // Update user debt
    user_position.debt_usdc = current_debt
        .checked_sub(repay_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // Update borrow index snapshot
    user_position.borrow_index_snapshot = config.global_borrow_index;
    user_position.last_update_timestamp = clock.unix_timestamp;

    // Update global debt
    config.total_debt_usdc = config.total_debt_usdc
        .saturating_sub(repay_amount);

    msg!("Repaid {} USDC for user: {}", repay_amount, ctx.accounts.owner.key());
    msg!("Remaining debt: {} USDC", user_position.debt_usdc);

    Ok(())
}
