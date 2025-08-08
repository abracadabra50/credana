use anchor_lang::prelude::*;

/// Debit account for USDC spending
/// Separate from credit positions - no debt, just balance
#[account]
pub struct DebitAccount {
    /// Owner of this debit account (user's wallet)
    pub owner: Pubkey,
    
    /// USDC deposited (6 decimals)
    pub usdc_deposited: u64,
    
    /// USDC available for spending (6 decimals)
    pub usdc_available: u64,
    
    /// USDC reserved for pending transactions (6 decimals)
    pub usdc_reserved: u64,
    
    /// Total lifetime deposits
    pub lifetime_deposits: u64,
    
    /// Total lifetime spent
    pub lifetime_spent: u64,
    
    /// Daily spending limit
    pub daily_limit: u64,
    
    /// Daily spent (resets daily)
    pub daily_spent: u64,
    
    /// Last daily reset timestamp
    pub last_daily_reset: i64,
    
    /// Monthly spending limit
    pub monthly_limit: u64,
    
    /// Monthly spent (resets monthly)
    pub monthly_spent: u64,
    
    /// Last monthly reset timestamp
    pub last_monthly_reset: i64,
    
    /// Account status (0: inactive, 1: active, 2: frozen)
    pub status: u8,
    
    /// Account initialized
    pub is_initialized: bool,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 16],
}

impl DebitAccount {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        8 + // usdc_deposited
        8 + // usdc_available
        8 + // usdc_reserved
        8 + // lifetime_deposits
        8 + // lifetime_spent
        8 + // daily_limit
        8 + // daily_spent
        8 + // last_daily_reset
        8 + // monthly_limit
        8 + // monthly_spent
        8 + // last_monthly_reset
        1 + // status
        1 + // is_initialized
        (8 * 16); // _reserved
        
    /// Check if spending is allowed
    pub fn can_spend(&self, amount: u64, current_timestamp: i64) -> Result<bool> {
        // Check status
        if self.status != 1 {
            return Ok(false);
        }
        
        // Check available balance
        if self.usdc_available < amount {
            return Ok(false);
        }
        
        // Check daily limit (with reset if needed)
        let daily_spent = if self.needs_daily_reset(current_timestamp) {
            0
        } else {
            self.daily_spent
        };
        
        if daily_spent + amount > self.daily_limit {
            return Ok(false);
        }
        
        // Check monthly limit (with reset if needed)
        let monthly_spent = if self.needs_monthly_reset(current_timestamp) {
            0
        } else {
            self.monthly_spent
        };
        
        if monthly_spent + amount > self.monthly_limit {
            return Ok(false);
        }
        
        Ok(true)
    }
    
    /// Check if daily limit needs reset
    pub fn needs_daily_reset(&self, current_timestamp: i64) -> bool {
        const SECONDS_PER_DAY: i64 = 86400;
        current_timestamp / SECONDS_PER_DAY > self.last_daily_reset / SECONDS_PER_DAY
    }
    
    /// Check if monthly limit needs reset
    pub fn needs_monthly_reset(&self, current_timestamp: i64) -> bool {
        // Simple check: if month changed
        // In production, would use proper date math
        const SECONDS_PER_MONTH: i64 = 2592000; // ~30 days
        current_timestamp / SECONDS_PER_MONTH > self.last_monthly_reset / SECONDS_PER_MONTH
    }
    
    /// Reserve funds for pending transaction
    pub fn reserve_funds(&mut self, amount: u64) -> Result<()> {
        require!(
            self.usdc_available >= amount,
            error!(crate::errors::CreditError::InsufficientBalance)
        );
        
        self.usdc_available = self.usdc_available
            .checked_sub(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        self.usdc_reserved = self.usdc_reserved
            .checked_add(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        Ok(())
    }
    
    /// Commit reserved funds (transaction settled)
    pub fn commit_reserved(&mut self, amount: u64, current_timestamp: i64) -> Result<()> {
        require!(
            self.usdc_reserved >= amount,
            error!(crate::errors::CreditError::InsufficientBalance)
        );
        
        self.usdc_reserved = self.usdc_reserved
            .checked_sub(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        self.lifetime_spent = self.lifetime_spent
            .checked_add(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        // Update daily spent (with reset if needed)
        if self.needs_daily_reset(current_timestamp) {
            self.daily_spent = amount;
            self.last_daily_reset = current_timestamp;
        } else {
            self.daily_spent = self.daily_spent
                .checked_add(amount)
                .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
        }
        
        // Update monthly spent (with reset if needed)
        if self.needs_monthly_reset(current_timestamp) {
            self.monthly_spent = amount;
            self.last_monthly_reset = current_timestamp;
        } else {
            self.monthly_spent = self.monthly_spent
                .checked_add(amount)
                .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
        }
        
        Ok(())
    }
    
    /// Release reserved funds (transaction declined/cancelled)
    pub fn release_reserved(&mut self, amount: u64) -> Result<()> {
        require!(
            self.usdc_reserved >= amount,
            error!(crate::errors::CreditError::InsufficientBalance)
        );
        
        self.usdc_reserved = self.usdc_reserved
            .checked_sub(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        self.usdc_available = self.usdc_available
            .checked_add(amount)
            .ok_or(error!(crate::errors::CreditError::MathOverflow))?;
            
        Ok(())
    }
}


