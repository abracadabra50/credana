use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

#[program]
pub mod credit_core {
    use super::*;

    /// Initialize the protocol configuration
    /// Can only be called once by the deployer
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Initialize a new user position
    /// Creates a PDA account to track user's collateral and debt
    pub fn init_position(ctx: Context<InitPosition>) -> Result<()> {
        instructions::init_position::handler(ctx)
    }

    /// Deposit collateral (jitoSOL) into user's position
    /// Transfers tokens from user to program vault
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::deposit_collateral::handler(ctx, amount)
    }

    /// Withdraw collateral from user's position
    /// Checks health factor remains safe after withdrawal
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        instructions::withdraw_collateral::handler(ctx, amount)
    }

    /// Record debt increase from card transaction
    /// Called by backend after card capture event
    pub fn record_debt(ctx: Context<RecordDebt>, usdc_amount: u64) -> Result<()> {
        instructions::record_debt::handler(ctx, usdc_amount)
    }

    /// Repay USDC debt
    /// Burns debt and accrues interest
    pub fn repay_usdc(ctx: Context<RepayUsdc>, amount: u64) -> Result<()> {
        instructions::repay_usdc::handler(ctx, amount)
    }

    /// Liquidate an unhealthy position
    /// Anyone can call when health factor < liquidation threshold
    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        instructions::liquidate::handler(ctx, repay_amount)
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