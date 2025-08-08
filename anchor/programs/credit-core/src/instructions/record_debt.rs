use anchor_lang::prelude::*;
use crate::state::{Config, UserPosition};
use crate::utils::calculate_borrow_index;
use crate::constants::*;

#[derive(Accounts)]
pub struct RecordDebt<'info> {
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

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<RecordDebt>, usdc_amount: u64) -> Result<()> {
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

    // Update user's existing debt with interest
    if user_position.debt_usdc > 0 {
        user_position.debt_usdc = user_position.calculate_debt_with_interest(config.global_borrow_index)?;
    }

    // Add new debt
    user_position.debt_usdc = user_position.debt_usdc
        .checked_add(usdc_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;
    
    // Update borrow index snapshot
    user_position.borrow_index_snapshot = config.global_borrow_index;
    user_position.last_update_timestamp = clock.unix_timestamp;

    // Update global debt
    config.total_debt_usdc = config.total_debt_usdc
        .checked_add(usdc_amount)
        .ok_or(crate::errors::CreditError::MathOverflow)?;

    msg!("Recorded {} USDC debt for user: {}", usdc_amount, ctx.accounts.owner.key());

    Ok(())
}
