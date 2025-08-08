// PDA Seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const USER_POSITION_SEED: &[u8] = b"user_position";
pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

// Protocol Parameters (basis points)
pub const DEFAULT_LTV_MAX_BPS: u16 = 5000; // 50%
pub const DEFAULT_LIQUIDATION_THRESHOLD_BPS: u16 = 6000; // 60%
pub const DEFAULT_LIQUIDATION_BONUS_BPS: u16 = 600; // 6%
pub const DEFAULT_INTEREST_RATE_BPS: u16 = 1200; // 12% APR

// Safety Parameters
pub const HEALTH_FACTOR_BUFFER_BPS: u16 = 1100; // 1.10 health factor required for borrows
pub const MAX_CONFIDENCE_DEVIATION_BPS: u16 = 200; // 2% max price confidence deviation
pub const MAX_ORACLE_STALENESS_SLOTS: u64 = 30; // ~15 seconds at 2 slots/sec

// Precision Constants
pub const BPS_PRECISION: u64 = 10_000; // Basis points precision
pub const RAY_PRECISION: u128 = 1_000_000_000_000_000_000_000_000_000; // 27 decimals for interest calculations
pub const SECONDS_PER_YEAR: u64 = 31_536_000; // 365 days

// Token Decimals
pub const USDC_DECIMALS: u8 = 6;
pub const SOL_DECIMALS: u8 = 9;
pub const JITO_SOL_DECIMALS: u8 = 9;

// Limits
pub const MIN_DEPOSIT_AMOUNT: u64 = 100_000_000; // 0.1 SOL minimum deposit
pub const MIN_REPAY_AMOUNT: u64 = 1_000_000; // 1 USDC minimum repayment

// Supported Collateral (for MVP, only jitoSOL)
pub const JITO_SOL_MINT: &str = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"; 
// Native SOL wrapped token (constant address)
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
