use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::CreditError;
use crate::oracle::get_pyth_price;

/// Mock oracle price for devnet testing fallback
/// Returns a hardcoded price for SOL/USD
pub fn get_mock_sol_price() -> Result<u64> {
    // Mock SOL price at $100 for testing
    // Price in 6 decimals (USDC decimals)
    Ok(100_000_000) // $100.00
}

/// Get price with fallback to mock if oracle fails
pub fn get_price_with_fallback(
    price_account_info: &AccountInfo,
) -> Result<u64> {
    // Try real Pyth oracle first
    get_pyth_price(price_account_info)
        .map(|price| price as u64)
        .or_else(|_| {
            // Fallback to mock price if oracle fails
            msg!("Warning: Using mock price due to oracle failure");
            get_mock_sol_price()
        })
}

/// Calculate borrow index based on time elapsed
pub fn calculate_borrow_index(
    last_update_timestamp: i64,
    current_timestamp: i64,
    borrow_index: u128,  // Changed to match Config type
    interest_rate_bps: u16,
) -> Result<u128> {      // Returns u128 to match Config
    // Time elapsed in seconds
    let time_diff = current_timestamp
        .checked_sub(last_update_timestamp)
        .ok_or(error!(CreditError::MathOverflow))? as u64;
    
    // Annual interest rate in basis points (e.g., 1200 = 12%)
    // Convert to per-second rate
    let seconds_per_year = 365 * 24 * 60 * 60u64;
    
    // Calculate accrued interest (simplified)
    // new_index = old_index * (1 + rate * time / seconds_per_year)
    let interest_accrued = borrow_index
        .checked_mul(interest_rate_bps as u128)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_mul(time_diff as u128)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_div(seconds_per_year as u128)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_div(10000) // Convert from basis points
        .ok_or(error!(CreditError::MathOverflow))?;
    
    let new_index = borrow_index
        .checked_add(interest_accrued)
        .ok_or(error!(CreditError::MathOverflow))?;
    
    Ok(new_index)
}

/// Calculate maximum borrow amount based on collateral value and LTV
pub fn calculate_max_borrow(
    collateral_value_usdc: u64,
    ltv_max_bps: u16,
) -> Result<u64> {
    let max_borrow = (collateral_value_usdc as u128)
        .checked_mul(ltv_max_bps as u128)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_div(10000) // Convert from basis points
        .ok_or(error!(CreditError::MathOverflow))?;
    
    Ok(max_borrow as u64)
}

/// Calculate health factor
pub fn calculate_health_factor(
    collateral_value_usdc: u64,
    debt_usdc: u64,
    liquidation_threshold_bps: u16,
) -> Result<u64> {
    if debt_usdc == 0 {
        // Max health when no debt
        return Ok(u64::MAX);
    }
    
    let liquidation_value = (collateral_value_usdc as u128)
        .checked_mul(liquidation_threshold_bps as u128)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_div(10000) // Convert from basis points
        .ok_or(error!(CreditError::MathOverflow))?;
    
    // Health factor = liquidation_value / debt
    // Scaled by 100 for precision (100 = 1.0)
    let health_factor = liquidation_value
        .checked_mul(100)
        .ok_or(error!(CreditError::MathOverflow))?
        .checked_div(debt_usdc as u128)
        .ok_or(error!(CreditError::MathOverflow))?;
    
    Ok(health_factor as u64)
}
