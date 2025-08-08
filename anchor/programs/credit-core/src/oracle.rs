use anchor_lang::prelude::*;
use crate::errors::CreditError;

/// Custom Pyth price reader - avoiding SDK dependency conflicts
/// This directly parses Pyth oracle account data
pub fn get_pyth_price(price_account: &AccountInfo) -> Result<i64> {
    // Verify account is owned by Pyth (hardcoded devnet address)
    let pyth_program: Pubkey = "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s".parse().unwrap();
    
    require_keys_eq!(
        *price_account.owner,
        pyth_program,
        CreditError::InvalidOracle
    );
    
    let data = &price_account.data.borrow();
    
    // Minimum size check for Pyth price account
    require!(
        data.len() >= 216,  // Need at least 216 bytes for price at offset 208
        CreditError::InvalidOracle
    );
    
    // Read price components from correct offsets
    // Devnet Pyth V2 format: price at 208, confidence at 216, exponent at 20
    let price_raw = i64::from_le_bytes(
        data[208..216]
            .try_into()
            .map_err(|_| error!(CreditError::InvalidOracle))?
    );
    
    let expo = i32::from_le_bytes(
        data[20..24]
            .try_into()
            .map_err(|_| error!(CreditError::InvalidOracle))?
    );
    
    // Price status (offset 200) - 1 = Trading
    let status = data[200];
    require!(
        status == 1,
        CreditError::StaleOracle
    );
    
    // Convert to USDC price (6 decimals)
    // price_raw is in 10^expo, we want 10^6
    let adjustment = 6 - (-expo);  // expo is negative
    
    let price_usdc = if adjustment >= 0 {
        price_raw
            .checked_mul(10_i64.pow(adjustment as u32))
            .ok_or(error!(CreditError::MathOverflow))?
    } else {
        price_raw
            .checked_div(10_i64.pow((-adjustment) as u32))
            .ok_or(error!(CreditError::MathOverflow))?
    };
    
    // Sanity check: SOL should be between $10 and $10,000
    require!(
        price_usdc > 10_000_000 && price_usdc < 10_000_000_000,
        CreditError::InvalidOracle
    );
    
    msg!("Pyth SOL/USD price: ${}", price_usdc as f64 / 1_000_000.0);
    
    Ok(price_usdc)
}
