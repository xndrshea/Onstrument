use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod utils;

use crate::instructions::*;

declare_id!("5EgejWaVQjxQ8ydLHvPdBpDGvkKioS1Uk3amGKqSx2zg");

#[program]
pub mod bonding_curve {
    use super::*;

    pub fn create_token(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
        create_token::handler(ctx, params)
    }

    pub fn create_metadata(ctx: Context<CreateMetadata>, params: CreateMetadataParams) -> Result<()> {
        create_metadata::handler(ctx, params)
    }

    pub fn buy(ctx: Context<Buy>, amount: u64, max_sol_cost: u64) -> Result<()> {
        buy::handler(ctx, amount, max_sol_cost)
    }

    pub fn sell(ctx: Context<Sell>, amount: u64, min_sol_return: u64) -> Result<()> {
        sell::handler(ctx, amount, min_sol_return)
    }

    pub fn calculate_price(ctx: Context<GetPrice>, amount: u64, is_buy: bool) -> Result<u64> {
        price::calculate_price(ctx, amount, is_buy)
    }
}
