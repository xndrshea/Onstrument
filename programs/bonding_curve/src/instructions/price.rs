use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use crate::state::*;

#[derive(Accounts)]
pub struct GetPriceInfo<'info> {
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceInfo {
    pub spot_price: u64,
}

pub fn get_price_info(ctx: Context<GetPriceInfo>) -> Result<PriceInfo> {
    let curve = &ctx.accounts.curve;
    let token_vault = &ctx.accounts.token_vault;
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    let spot_price = curve.get_spot_price(token_vault, curve_lamports)?;

    Ok(PriceInfo {
        spot_price,
    })
}
