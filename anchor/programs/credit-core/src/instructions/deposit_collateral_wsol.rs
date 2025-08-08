use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, UserPosition};
use crate::errors::CreditError;
use crate::utils::{get_price_with_fallback, calculate_max_borrow, calculate_borrow_index};

#[derive(Accounts)]
pub struct DepositCollateralWsol<'info> {
    #[account(
        mut,
        seeds = [b"user_position", owner.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub user_wsol_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", wsol_mint.key().as_ref()],
        bump
    )]
    pub vault_wsol: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"vault_authority"],
        bump
    )]
    /// CHECK: PDA authority for vault operations
    pub vault_authority: UncheckedAccount<'info>,

    pub wsol_mint: Account<'info, token::Mint>,

    /// CHECK: Pyth oracle account
    pub sol_usd_oracle: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCollateralWsol>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let user_position = &mut ctx.accounts.user_position;

    // Ensure protocol is not paused
    require!(!config.paused, CreditError::ProtocolPaused);

    // Ensure WSOL mint matches config
    require_keys_eq!(
        ctx.accounts.wsol_mint.key(),
        config.wsol_mint,
        CreditError::InvalidCollateralMint
    );

    // Ensure position is initialized
    require!(
        user_position.owner == ctx.accounts.owner.key(),
        CreditError::Unauthorized
    );

    // If this is the first deposit, set the collateral mint
    if user_position.collateral_mint == Pubkey::default() {
        user_position.collateral_mint = ctx.accounts.wsol_mint.key();
    } else {
        // Ensure user is depositing the same collateral type
        require_keys_eq!(
            user_position.collateral_mint,
            ctx.accounts.wsol_mint.key(),
            CreditError::InvalidCollateralMint
        );
    }

    let clock = Clock::get()?;

    // Update global interest index
    config.global_borrow_index = calculate_borrow_index(
        config.last_update_timestamp,
        clock.unix_timestamp,
        config.global_borrow_index,
        config.interest_rate_bps
    )?;
    config.last_update_timestamp = clock.unix_timestamp;

    // Transfer WSOL from user to vault
    let transfer_ix = Transfer {
        from: ctx.accounts.user_wsol_account.to_account_info(),
        to: ctx.accounts.vault_wsol.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_ix
        ),
        amount
    )?;

    msg!(
        "Deposited {} WSOL from {} to vault",
        amount,
        ctx.accounts.owner.key()
    );

    // Calculate new total collateral
    let new_collateral_amount = user_position.collateral_amount
        .checked_add(amount)
        .ok_or(CreditError::MathOverflow)?;

    // Get current SOL price and update credit limit
    let sol_price = get_price_with_fallback(&ctx.accounts.sol_usd_oracle.to_account_info())?;

    // Calculate collateral value in USD (amount is in lamports, sol_price is in USDC decimals)
    // collateral_value_usd = amount * sol_price / 10^9
    let collateral_value_usd = (new_collateral_amount as u128)
        .checked_mul(sol_price as u128)
        .ok_or(CreditError::MathOverflow)?
        .checked_div(1_000_000_000) // Convert from lamports to SOL
        .ok_or(CreditError::MathOverflow)? as u64;

    let new_credit_limit = calculate_max_borrow(
        collateral_value_usd,
        config.ltv_max_bps
    )?;

    // Update position
    user_position.collateral_amount = new_collateral_amount;
    user_position.last_update_slot = clock.slot;
    user_position.last_update_timestamp = clock.unix_timestamp;
    user_position.collateral_mint = ctx.accounts.wsol_mint.key();
    user_position.credit_limit = new_credit_limit;

    // Update global totals
    config.total_collateral = config.total_collateral
        .saturating_add(collateral_value_usd);

    msg!(
        "Updated position - Collateral: {} WSOL, Value: ${}, Credit Limit: ${}",
        user_position.collateral_amount,
        collateral_value_usd,
        new_credit_limit
    );

    Ok(())
}
