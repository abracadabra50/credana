use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateParams {
    pub ltv_max_bps: Option<u16>,
    pub liquidation_threshold_bps: Option<u16>,
    pub liquidation_bonus_bps: Option<u16>,
    pub interest_rate_bps: Option<u16>,
    pub sol_usd_oracle: Option<Pubkey>,
    pub jito_sol_usd_oracle: Option<Pubkey>,
    pub new_admin: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct AdminSetParams<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
        constraint = config.admin == admin.key() @ crate::errors::CreditError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<AdminSetParams>, params: UpdateParams) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    // Update LTV max if provided
    if let Some(ltv_max_bps) = params.ltv_max_bps {
        require!(ltv_max_bps <= 10000, crate::errors::CreditError::InvalidPercentage);
        require!(
            ltv_max_bps < config.liquidation_threshold_bps, 
            crate::errors::CreditError::InvalidPercentage
        );
        config.ltv_max_bps = ltv_max_bps;
        msg!("Updated LTV max to {}%", ltv_max_bps / 100);
    }
    
    // Update liquidation threshold if provided
    if let Some(liquidation_threshold_bps) = params.liquidation_threshold_bps {
        require!(
            liquidation_threshold_bps <= 10000, 
            crate::errors::CreditError::InvalidPercentage
        );
        require!(
            liquidation_threshold_bps > config.ltv_max_bps, 
            crate::errors::CreditError::InvalidPercentage
        );
        config.liquidation_threshold_bps = liquidation_threshold_bps;
        msg!("Updated liquidation threshold to {}%", liquidation_threshold_bps / 100);
    }
    
    // Update liquidation bonus if provided
    if let Some(liquidation_bonus_bps) = params.liquidation_bonus_bps {
        require!(
            liquidation_bonus_bps <= 2000, // Max 20% bonus
            crate::errors::CreditError::InvalidPercentage
        );
        config.liquidation_bonus_bps = liquidation_bonus_bps;
        msg!("Updated liquidation bonus to {}%", liquidation_bonus_bps / 100);
    }
    
    // Update interest rate if provided
    if let Some(interest_rate_bps) = params.interest_rate_bps {
        require!(
            interest_rate_bps <= 10000, // Max 100% APR
            crate::errors::CreditError::InvalidPercentage
        );
        config.interest_rate_bps = interest_rate_bps;
        msg!("Updated interest rate to {}%", interest_rate_bps / 100);
    }
    
    // Update SOL oracle if provided
    if let Some(sol_usd_oracle) = params.sol_usd_oracle {
        config.sol_usd_oracle = sol_usd_oracle;
        msg!("Updated SOL/USD oracle to {}", sol_usd_oracle);
    }
    
    // Update jitoSOL oracle if provided
    if let Some(jito_sol_usd_oracle) = params.jito_sol_usd_oracle {
        config.jito_sol_usd_oracle = jito_sol_usd_oracle;
        msg!("Updated jitoSOL/USD oracle to {}", jito_sol_usd_oracle);
    }
    
    // Update admin if provided (transfer ownership)
    if let Some(new_admin) = params.new_admin {
        config.admin = new_admin;
        msg!("Transferred admin to {}", new_admin);
    }
    
    Ok(())
} 