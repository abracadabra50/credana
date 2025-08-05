use anchor_lang::prelude::*;
use pyth_sdk_solana::Price;
use crate::constants::*;
use crate::errors::CreditError;

/// Validate Pyth oracle price feed
pub fn validate_oracle_price(price: &Price, max_confidence_bps: u16) -> Result<()> {
    // Check confidence interval
    let confidence_ratio = price.conf
        .checked_mul(BPS_PRECISION)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(price.price.abs() as u64)
        .ok_or(CreditError::MathOverflow)?;
        
    require!(
        confidence_ratio <= max_confidence_bps as u64,
        CreditError::OracleConfidenceTooWide
    );
    
    Ok(())
}

/// Get price from Pyth oracle with validation
pub fn get_pyth_price(
    price_account: &AccountInfo,
    clock: &Clock,
    max_staleness_slots: u64,
) -> Result<u64> {
    let price_feed = pyth_sdk_solana::state::SolanaPriceAccount::account_info_to_feed(price_account)
        .map_err(|_| CreditError::InvalidOracle)?;
        
    let current_price = price_feed
        .get_price_no_older_than(clock.unix_timestamp, 60)
        .ok_or(CreditError::StaleOracle)?;
        
    // Validate price freshness by checking publish time
    let price_unchecked = price_feed.get_price_unchecked();
    require!(
        clock.slot.saturating_sub(price_unchecked.publish_time as u64) <= max_staleness_slots,
        CreditError::StaleOracle
    );
    
    // Validate confidence
    validate_oracle_price(&current_price, MAX_CONFIDENCE_DEVIATION_BPS)?;
    
    // Convert to positive u64 (prices should always be positive)
    Ok(current_price.price.abs() as u64)
}

/// Calculate compound interest using borrow index
/// Returns new borrow index
pub fn calculate_borrow_index(
    current_index: u128,
    interest_rate_bps: u16,
    time_elapsed: i64,
) -> Result<u128> {
    if time_elapsed <= 0 {
        return Ok(current_index);
    }
    
    // interest_multiplier = 1 + (rate * time_elapsed / seconds_per_year)
    // Using RAY precision for accurate calculations
    let rate_ray = (interest_rate_bps as u128)
        .checked_mul(RAY_PRECISION)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(BPS_PRECISION as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    let interest_delta = rate_ray
        .checked_mul(time_elapsed as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(SECONDS_PER_YEAR as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    let new_index = current_index
        .checked_mul(RAY_PRECISION.checked_add(interest_delta).ok_or(CreditError::MathOverflow)?)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(RAY_PRECISION)
        .ok_or(CreditError::MathOverflow)?;
        
    Ok(new_index)
}

/// Calculate maximum borrowable amount based on collateral and LTV
pub fn calculate_max_borrow(
    collateral_amount: u64,
    collateral_price: u64,
    ltv_max_bps: u16,
) -> Result<u64> {
    // max_borrow = collateral_amount * price * ltv / 10000
    // Convert from 9 decimals (SOL) to 6 decimals (USDC)
    let collateral_value_usdc = (collateral_amount as u128)
        .checked_mul(collateral_price as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(1_000u128) // 9 decimals to 6 decimals
        .ok_or(CreditError::MathOverflow)?;
        
    let max_borrow = collateral_value_usdc
        .checked_mul(ltv_max_bps as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(BPS_PRECISION as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    Ok(max_borrow as u64)
}

/// Calculate liquidation bonus amount
pub fn calculate_liquidation_bonus(
    repay_amount: u64,
    liquidation_bonus_bps: u16,
) -> Result<u64> {
    let bonus = (repay_amount as u128)
        .checked_mul(liquidation_bonus_bps as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(BPS_PRECISION as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    Ok(bonus as u64)
}

/// Convert USDC amount to collateral amount at given price
pub fn usdc_to_collateral(
    usdc_amount: u64,
    collateral_price: u64,
) -> Result<u64> {
    // collateral = usdc * 1000 / price (converting 6 decimals to 9 decimals)
    let collateral = (usdc_amount as u128)
        .checked_mul(1_000u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(collateral_price as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    Ok(collateral as u64)
}

/// Check if a value is within slippage tolerance
pub fn check_slippage(
    expected: u64,
    actual: u64,
    tolerance_bps: u16,
) -> Result<()> {
    let diff = if expected > actual {
        expected - actual
    } else {
        actual - expected
    };
    
    let max_diff = (expected as u128)
        .checked_mul(tolerance_bps as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(BPS_PRECISION as u128)
        .ok_or(CreditError::MathOverflow)?;
        
    require!(
        diff as u128 <= max_diff,
        CreditError::SlippageExceeded
    );
    
    Ok(())
} 