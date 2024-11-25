use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::state::*;

#[derive(Accounts)]
pub struct GetPriceInfo<'info> {
    pub mint: Account<'info, Mint>,
    
    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PriceInfo {
    pub price: u64,
    pub supply_delta: i64,
    pub is_buy: bool,
}

pub fn get_info(ctx: Context<GetPriceInfo>, amount: u64, is_buy: bool) -> Result<PriceInfo> {
    let curve = &ctx.accounts.curve;
    
    let price = if is_buy {
        curve.calculate_buy_price(amount)?
    } else {
        curve.calculate_sell_price(amount)?
    };

    let supply_delta = if is_buy {
        amount as i64
    } else {
        -(amount as i64)
    };

    Ok(PriceInfo {
        price,
        supply_delta,
        is_buy,
    })
}
