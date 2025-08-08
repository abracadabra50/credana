use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub ltv_max_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub interest_rate_bps: u16,
    pub sol_usd_oracle: Pubkey,
    pub jito_sol_usd_oracle: Pubkey,
    pub usdc_mint: Pubkey,
    pub jito_sol_mint: Pubkey,
    pub wsol_mint: Pubkey,}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = Config::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    // Validate parameters
    require!(params.ltv_max_bps <= 10000, crate::errors::CreditError::InvalidPercentage);
    require!(params.liquidation_threshold_bps <= 10000, crate::errors::CreditError::InvalidPercentage);
    require!(params.liquidation_bonus_bps <= 10000, crate::errors::CreditError::InvalidPercentage);
    require!(params.interest_rate_bps <= 10000, crate::errors::CreditError::InvalidPercentage);
    require!(params.ltv_max_bps < params.liquidation_threshold_bps, crate::errors::CreditError::InvalidPercentage);
    
    // Initialize config
    config.admin = ctx.accounts.admin.key();
    config.paused = false;
    config.ltv_max_bps = params.ltv_max_bps;
    config.liquidation_threshold_bps = params.liquidation_threshold_bps;
    config.liquidation_bonus_bps = params.liquidation_bonus_bps;
    config.interest_rate_bps = params.interest_rate_bps;
    config.sol_usd_oracle = params.sol_usd_oracle;
    config.jito_sol_usd_oracle = params.jito_sol_usd_oracle;
    config.usdc_mint = params.usdc_mint;
    config.jito_sol_mint = params.jito_sol_mint;
    config.wsol_mint = params.wsol_mint;    config.global_borrow_index = RAY_PRECISION;
    config.last_update_timestamp = Clock::get()?.unix_timestamp;
    config.total_debt_usdc = 0;
    config.total_collateral = 0;
    config._reserved = [0; 16];
    
    msg!("Protocol initialized with admin: {}", ctx.accounts.admin.key());
    msg!("LTV: {}%, Liquidation: {}%, Bonus: {}%, APR: {}%", 
        params.ltv_max_bps / 100,
        params.liquidation_threshold_bps / 100,
        params.liquidation_bonus_bps / 100,
        params.interest_rate_bps / 100
    );
    
    Ok(())
} 