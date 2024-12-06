use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
use solana_program::rent::Rent;
use crate::state::*;
use crate::utils::error::ErrorCode;

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
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
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Sell>, amount: u64, min_sol_return: u64) -> Result<()> {
    // Get the current lamports before mutable borrow
    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    // Calculate rent-exempt balance for the curve account
    let rent = Rent::get()?;
    let rent_exempt_balance = rent.minimum_balance(ctx.accounts.curve.to_account_info().data_len());
    
    // Calculate actual available liquidity (excluding rent)
    let available_liquidity = curve_lamports.checked_sub(rent_exempt_balance)
        .ok_or(ErrorCode::InsufficientLiquidity)?;
    
    let curve = &mut ctx.accounts.curve;
    let price = curve.calculate_sell_price(
        &ctx.accounts.token_vault,
        amount,
        available_liquidity  // Use available liquidity instead of total lamports
    )?;
    
    require!(price >= min_sol_return, ErrorCode::PriceBelowMinReturn);
    require!(price <= available_liquidity, ErrorCode::InsufficientLiquidity);

    // Transfer tokens from seller to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        },
    );
    anchor_spl::token::transfer(transfer_ctx, amount)?;

    // Transfer SOL from curve to seller
    **ctx.accounts.curve.to_account_info().try_borrow_mut_lamports()? = ctx.accounts.curve
        .to_account_info()
        .lamports()
        .checked_sub(price)
        .ok_or(ErrorCode::MathOverflow)?;
    **ctx.accounts.seller.try_borrow_mut_lamports()? = ctx.accounts.seller
        .lamports()
        .checked_add(price)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
