use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use crate::state::*;
use crate::utils::error::ErrorCode;

#[derive(Accounts)]
#[instruction(amount: u64, is_buy: bool)]
pub struct GetPriceInfo<'info> {
    /// The mint of the token
    pub mint: Account<'info, Mint>,
    
    /// The bonding curve account
    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
        has_one = mint,
    )]
    pub curve: Account<'info, BondingCurve>,

    /// The token vault that holds the liquidity
    #[account(
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
    )]
    pub token_vault: Account<'info, TokenAccount>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceInfo {
    pub price: u64,
    pub is_buy: bool,
}

pub fn get_price_info(ctx: Context<GetPriceInfo>, amount: u64, is_buy: bool) -> Result<PriceInfo> {
    if amount == 0 {
        return err!(ErrorCode::InvalidAmount);
    }

    let curve = &ctx.accounts.curve;
    let token_vault = &ctx.accounts.token_vault;
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    let price = if is_buy {
        curve.calculate_buy_price(token_vault, amount, curve_lamports)?
    } else {
        curve.calculate_sell_price(token_vault, amount, curve_lamports)?
    };

    Ok(PriceInfo {
        price,
        is_buy,
    })
}
