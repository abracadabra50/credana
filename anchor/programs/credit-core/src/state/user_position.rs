use anchor_lang::prelude::*;

/// Individual user's credit position
/// Tracks collateral, debt, and borrowing state
#[account]
pub struct UserPosition {
    /// Owner of this position (user's wallet)
    pub owner: Pubkey,
    
    /// Collateral mint (jitoSOL for MVP)
    pub collateral_mint: Pubkey,
    
    /// Amount of collateral deposited (9 decimals)
    pub collateral_amount: u64,
    
    /// USDC debt amount (6 decimals)
    pub debt_usdc: u64,
    
    /// User's borrow index snapshot for interest calculation
    pub borrow_index_snapshot: u128,
    
    /// Last update slot
    pub last_update_slot: u64,
    
    /// Last update timestamp
    pub last_update_timestamp: i64,
    
    /// Total lifetime borrows in USDC
    pub lifetime_borrows: u64,
    
    /// Total lifetime repayments in USDC
    pub lifetime_repayments: u64,
    
    /// Number of liquidations
    pub liquidation_count: u32,
    
    /// Position initialized
    pub is_initialized: bool,
    
    /// Credit limit in USDC (can be different from max LTV * collateral)
    pub credit_limit: u64,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 16],
}

impl UserPosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // collateral_mint
        8 + // collateral_amount
        8 + // debt_usdc
        16 + // borrow_index_snapshot
        8 + // last_update_slot
        8 + // last_update_timestamp
        8 + // lifetime_borrows
        8 + // lifetime_repayments
        4 + // liquidation_count
        1 + // is_initialized
        8 + // credit_limit
        (8 * 16); // _reserved
        
    /// Calculate current debt with accrued interest
    pub fn calculate_debt_with_interest(&self, current_borrow_index: u128) -> Result<u64> {
        if self.debt_usdc == 0 {
            return Ok(0);
        }
        
        // debt_with_interest = debt * (current_index / snapshot_index)
        let debt_u128 = self.debt_usdc as u128;
        let debt_with_interest = debt_u128
            .checked_mul(current_borrow_index)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(self.borrow_index_snapshot)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        Ok(debt_with_interest as u64)
    }
    
    /// Check if position is healthy given current prices
    pub fn is_healthy(
        &self,
        collateral_price: u64,
        liquidation_threshold_bps: u16,
        current_debt: u64,
    ) -> Result<bool> {
        if current_debt == 0 {
            return Ok(true);
        }
        
        // Calculate collateral value in USDC
        // collateral_value = collateral_amount * price / 10^(collateral_decimals - usdc_decimals)
        let collateral_value = (self.collateral_amount as u128)
            .checked_mul(collateral_price as u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(1_000u128) // Convert 9 decimals to 6 decimals
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        // Calculate liquidation value
        let liquidation_value = collateral_value
            .checked_mul(liquidation_threshold_bps as u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(10_000u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        Ok(liquidation_value >= current_debt as u128)
    }
    
    /// Calculate health factor (collateral_value * liq_threshold / debt)
    pub fn calculate_health_factor(
        &self,
        collateral_price: u64,
        liquidation_threshold_bps: u16,
        current_debt: u64,
    ) -> Result<u64> {
        if current_debt == 0 {
            return Ok(u64::MAX); // Infinite health factor when no debt
        }
        
        // Calculate collateral value in USDC
        let collateral_value = (self.collateral_amount as u128)
            .checked_mul(collateral_price as u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(1_000u128) // Convert 9 decimals to 6 decimals
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        // Calculate liquidation value
        let liquidation_value = collateral_value
            .checked_mul(liquidation_threshold_bps as u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(10_000u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        // Health factor = liquidation_value / debt (with 4 decimal precision)
        let health_factor = liquidation_value
            .checked_mul(10_000u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?
            .checked_div(current_debt as u128)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        Ok(health_factor as u64)
    }
} 