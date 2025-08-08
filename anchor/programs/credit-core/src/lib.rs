use anchor_lang::prelude::*;

declare_id!("DzAXxi4XR4wc8ywFXXHfckEPx1neccaRWDjv7o4CCtE4");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod state;
pub mod utils;

use instructions::*;

#[program]
pub mod credit_core {
    use super::*;

    /// Initialize the protocol configuration
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Initialize a user's credit position
    pub fn init_position(ctx: Context<InitPosition>) -> Result<()> {
        instructions::init_position::handler(ctx)
    }

    /// Deposit collateral (WSOL) into user's position
    pub fn deposit_collateral_wsol(ctx: Context<DepositCollateralWsol>, amount: u64) -> Result<()> {
        instructions::deposit_collateral_wsol::handler(ctx, amount)
    }

    /// Record debt for a user (for testing/admin)
    pub fn record_debt(ctx: Context<RecordDebt>, usdc_amount: u64) -> Result<()> {
        instructions::record_debt::handler(ctx, usdc_amount)
    }

    /// Repay USDC debt (simplified version)
    pub fn repay_usdc(ctx: Context<RepayUsdc>, usdc_amount: u64) -> Result<()> {
        instructions::repay_usdc::handler(ctx, usdc_amount)
    }

    /// Admin function to update protocol parameters
    pub fn admin_set_params(ctx: Context<AdminSetParams>, params: UpdateParams) -> Result<()> {
        instructions::admin_set_params::handler(ctx, params)
    }

    /// Admin function to pause/unpause protocol
    pub fn admin_set_paused(ctx: Context<AdminSetPaused>, paused: bool) -> Result<()> {
        instructions::admin_set_paused::handler(ctx, paused)
    }
}
