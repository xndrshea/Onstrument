use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use crate::state::*;

#[derive(Accounts)]
pub struct GetPrice<'info> {
    /// The mint of the token
    pub mint: Account<'info, Mint>,
    
    /// The bonding curve account
    #[account(
        seeds = [
            b"bonding_curve",
            curve.config.developer.as_ref(),
            curve.token_seed.as_ref()
        ],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    /// The token vault that holds the liquidity
    #[account(
        seeds = [
            b"token_vault",
            curve.config.developer.as_ref(),
            curve.token_seed.as_ref()
        ],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,
}

pub fn calculate_price(ctx: Context<GetPrice>, amount: u64, is_buy: bool) -> Result<u64> {
    let curve = &ctx.accounts.curve;
    let token_vault = &ctx.accounts.token_vault;
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();

    if is_buy {
        curve.calculate_buy_price(token_vault, amount, curve_lamports)
    } else {
        curve.calculate_sell_price(token_vault, amount, curve_lamports)
    }
}

pub fn get_migration_status(ctx: Context<GetPrice>) -> Result<MigrationStatus> {
    Ok(ctx.accounts.curve.config.migration_status)
}

pub fn calculate_tokens_for_sol(ctx: Context<GetPrice>, sol_amount: u64) -> Result<u64> {
    let curve = &ctx.accounts.curve;
    let token_vault = &ctx.accounts.token_vault;
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();

    // Calculate how many tokens the user will receive for their SOL
    curve.calculate_tokens_for_sol(
        token_vault,
        sol_amount,
        curve_lamports
    )
}
