use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
use std::str::FromStr;
use crate::state::*;
use crate::utils::error::ErrorCode;
use crate::state::bonding_curve::MIGRATION_THRESHOLD;
use crate::utils::constants::{TRADE_FEE_BPS, FEE_COLLECTOR};
use crate::instructions::migrate;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Static fee collector address
    #[account(
        mut,
        constraint = fee_collector.key() == Pubkey::from_str(FEE_COLLECTOR).unwrap()
    )]
    pub fee_collector: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        mut,
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == mint.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Buy>, amount: u64, max_sol_cost: u64, is_subscribed: bool) -> Result<()> {
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    // Check if we need to migrate
    if curve_lamports >= MIGRATION_THRESHOLD 
        && ctx.accounts.curve.config.migration_status == MigrationStatus::Active 
    {
        migrate::handler(Context::new(
            ctx.program_id,
            ctx.accounts,
            ctx.remaining_accounts,
            ctx.bumps,
        ))?;
    }

    // Calculate base price
    let base_price = ctx.accounts.curve.calculate_buy_price(
        &ctx.accounts.token_vault,
        amount,
        curve_lamports
    )?;

    // Calculate fee if not subscribed
    let (final_price, fee_amount) = if !is_subscribed {
        let fee = (base_price * TRADE_FEE_BPS) / 10000;
        (base_price + fee, fee)
    } else {
        (base_price, 0)
    };

    require!(final_price <= max_sol_cost, ErrorCode::PriceExceedsMaxCost);

    // Transfer base price to curve
    let transfer_sol_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.curve.to_account_info(),
    };
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_sol_ix,
        ),
        base_price,
    )?;

    // Transfer fee if applicable
    if fee_amount > 0 {
        let fee_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.fee_collector.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                fee_ix,
            ),
            fee_amount,
        )?;
    }

    // Transfer tokens from vault to buyer
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"bonding_curve",
        mint_key.as_ref(),
        &[ctx.accounts.curve.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}
