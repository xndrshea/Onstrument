use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
use solana_program::rent::Rent;
use std::str::FromStr;
use crate::state::*;
use crate::utils::error::ErrorCode;
use crate::utils::constants::{TRADE_FEE_BPS, FEE_COLLECTOR};

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            b"bonding_curve",
            curve.config.developer.as_ref(),
            curve.token_seed.as_ref()
        ],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        mut,
        constraint = seller_token_account.owner == seller.key(),
        constraint = seller_token_account.mint == mint.key(),
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
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

    /// CHECK: Static fee collector address
    #[account(
        mut,
        constraint = fee_collector.key() == FEE_COLLECTOR
    )]
    pub fee_collector: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Sell>, amount: u64, min_sol_return: u64, is_subscribed: bool) -> Result<()> {
    // Check migration status first
    require!(
        ctx.accounts.curve.config.migration_status == MigrationStatus::Active,
        ErrorCode::MigrationComplete
    );

    // Get the current lamports before mutable borrow
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    // Calculate rent-exempt balance for the curve account
    let rent = Rent::get()?;
    let rent_exempt_balance = rent.minimum_balance(ctx.accounts.curve.to_account_info().data_len());
    
    // Calculate actual available liquidity (excluding rent) - use saturating_sub instead of checked_sub
    let available_liquidity = curve_lamports.saturating_sub(rent_exempt_balance);
    
    // Calculate base price and fee
    let base_price = ctx.accounts.curve.calculate_sell_price(
        &ctx.accounts.token_vault,
        amount,
        curve_lamports
    )?;

    let (curve_amount, fee_amount) = if !is_subscribed {
        let fee = (base_price * TRADE_FEE_BPS) / 10000;
        (base_price, fee)
    } else {
        (base_price, 0)
    };

    // Ensure we don't transfer more than available liquidity
    let actual_transfer = std::cmp::min(curve_amount, available_liquidity);
    
    // Check total return against min_sol_return (after fees)
    let total_return = actual_transfer.saturating_sub(fee_amount);
    require!(total_return >= min_sol_return, ErrorCode::PriceBelowMinReturn);

    // Transfer tokens from seller to vault
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
            &[&[
                b"bonding_curve",
                ctx.accounts.curve.config.developer.as_ref(),
                ctx.accounts.curve.token_seed.as_ref(),
                &[ctx.accounts.curve.bump],
            ]],
        ),
        amount,
    )?;

    // Transfer SOL from curve to seller and fee collector
    **ctx.accounts.curve.to_account_info().try_borrow_mut_lamports()? = ctx
        .accounts
        .curve
        .to_account_info()
        .lamports()
        .checked_sub(actual_transfer)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    // Transfer to seller
    **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? = ctx
        .accounts
        .seller
        .to_account_info()
        .lamports()
        .checked_add(total_return)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    // Always transfer fee if applicable (even if amount was adjusted)
    if fee_amount > 0 {
        **ctx.accounts.fee_collector.try_borrow_mut_lamports()? = ctx
            .accounts
            .fee_collector
            .lamports()
            .checked_add(actual_transfer.saturating_sub(total_return))
            .ok_or(error!(ErrorCode::MathOverflow))?;
    }

    // Add after successful SOL transfer
    emit!(SellEvent {
        mint: ctx.accounts.mint.key(),
        amount,
        sol_amount: total_return,
        seller: ctx.accounts.seller.key(),
        is_subscribed
    });

    Ok(())
}
