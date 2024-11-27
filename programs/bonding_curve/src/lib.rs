use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod utils;

use crate::instructions::*;

declare_id!("DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw");

#[program]
pub mod bonding_curve {
    use super::*;

    pub fn create_token(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
        create_token::handler(ctx, params)
    }

    pub fn buy(ctx: Context<Buy>, amount: u64, max_sol_cost: u64) -> Result<()> {
        buy::handler(ctx, amount, max_sol_cost)
    }

    pub fn sell(ctx: Context<Sell>, amount: u64, min_sol_return: u64) -> Result<()> {
        sell::handler(ctx, amount, min_sol_return)
    }

    pub fn get_price_info(ctx: Context<GetPriceInfo>, amount: u64, is_buy: bool) -> Result<PriceInfo> {
        price::get_price_info(ctx, amount, is_buy)
    }
}
