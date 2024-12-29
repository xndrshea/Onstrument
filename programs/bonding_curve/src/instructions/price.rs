use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use crate::state::*;

#[derive(Accounts)]
pub struct GetPrice<'info> {
    /// The mint of the token
    pub mint: Account<'info, Mint>,
    
    /// The bonding curve account
    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    /// The token vault that holds the liquidity
    #[account(
        seeds = [b"token_vault", mint.key().as_ref()],
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
