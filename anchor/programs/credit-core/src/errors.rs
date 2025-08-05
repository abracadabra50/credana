use anchor_lang::prelude::*;

#[error_code]
pub enum CreditError {
    #[msg("Protocol is currently paused")]
    ProtocolPaused,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid collateral mint")]
    InvalidCollateralMint,
    
    #[msg("Insufficient collateral deposited")]
    InsufficientCollateral,
    
    #[msg("Health factor too low after operation")]
    HealthFactorTooLow,
    
    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy,
    
    #[msg("Amount too small")]
    AmountTooSmall,
    
    #[msg("Oracle price is stale")]
    StaleOracle,
    
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid percentage value")]
    InvalidPercentage,
    
    #[msg("Debt limit exceeded")]
    DebtLimitExceeded,
    
    #[msg("Repay amount exceeds debt")]
    RepayExceedsDebt,
    
    #[msg("Invalid oracle account")]
    InvalidOracle,
    
    #[msg("Liquidation amount too large")]
    LiquidationAmountTooLarge,
    
    #[msg("Position already initialized")]
    PositionAlreadyInitialized,
    
    #[msg("Invalid program authority")]
    InvalidAuthority,
    
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
} 