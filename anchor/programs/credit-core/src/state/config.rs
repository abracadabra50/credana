use anchor_lang::prelude::*;

/// Global protocol configuration
/// Stores risk parameters and oracle addresses
#[account]
pub struct Config {
    /// Protocol admin who can update parameters
    pub admin: Pubkey,
    
    /// Whether protocol is paused
    pub paused: bool,
    
    /// Maximum loan-to-value ratio in basis points (e.g., 5000 = 50%)
    pub ltv_max_bps: u16,
    
    /// Liquidation threshold in basis points (e.g., 6000 = 60%)
    pub liquidation_threshold_bps: u16,
    
    /// Liquidation bonus in basis points (e.g., 600 = 6%)
    pub liquidation_bonus_bps: u16,
    
    /// Interest rate in basis points (e.g., 1200 = 12% APR)
    pub interest_rate_bps: u16,
    
    /// Pyth oracle for SOL/USD price
    pub sol_usd_oracle: Pubkey,
    
    /// Pyth oracle for jitoSOL/USD price
    pub jito_sol_usd_oracle: Pubkey,
    
    /// USDC mint address
    pub usdc_mint: Pubkey,
    
    /// jitoSOL mint address
    pub jito_sol_mint: Pubkey,
    /// WSOL mint address
    pub wsol_mint: Pubkey,
    
    /// Global borrow index for interest accrual (Ray precision)
    pub global_borrow_index: u128,
    
    /// Last update timestamp
    pub last_update_timestamp: i64,
    
    /// Total protocol debt in USDC (6 decimals)
    pub total_debt_usdc: u64,
    
    /// Total collateral deposited (9 decimals for SOL-based tokens)
    pub total_collateral: u64,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 16],
}

impl Config {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        1 + // paused
        2 + // ltv_max_bps
        2 + // liquidation_threshold_bps
        2 + // liquidation_bonus_bps
        2 + // interest_rate_bps
        32 + // sol_usd_oracle
        32 + // jito_sol_usd_oracle
        32 + // usdc_mint
        32 + // jito_sol_mint
        32 + // wsol_mint        16 + // global_borrow_index
        8 + // last_update_timestamp
        8 + // total_debt_usdc
        8 + // total_collateral
        (8 * 16); // _reserved
} 
