use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod utils;

use crate::instructions::*;

declare_id!("6M1WSZeEAGtc8oTkdTNWruMsW58XPByzuf6ayoN16cEq");

#[program]
pub mod bonding_curve {
    use super::*;

    pub fn create_token(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
        create_token::handler(ctx, params)
    }

    pub fn create_metadata(ctx: Context<CreateMetadata>, params: CreateMetadataParams) -> Result<()> {
        create_metadata::handler(ctx, params)
    }

    pub fn buy(ctx: Context<Buy>, amount: u64, max_sol_cost: u64, is_subscribed: bool) -> Result<()> {
        buy::handler(ctx, amount, max_sol_cost, is_subscribed)
    }

    pub fn sell(ctx: Context<Sell>, amount: u64, min_sol_return: u64, is_subscribed: bool) -> Result<()> {
        sell::handler(ctx, amount, min_sol_return, is_subscribed)
    }

    pub fn calculate_price(ctx: Context<GetPrice>, amount: u64, is_buy: bool) -> Result<u64> {
        price::calculate_price(ctx, amount, is_buy)
    }
}
