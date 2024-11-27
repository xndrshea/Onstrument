use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
use crate::state::*;
use crate::utils::error::ErrorCode;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

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
        bump = curve.bump,
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

pub fn handler(ctx: Context<Buy>, amount: u64, max_sol_cost: u64) -> Result<()> {
    // Get the price first before any mutable borrows
    let price = ctx.accounts.curve.calculate_buy_price(
        &ctx.accounts.token_vault,
        amount,
        ctx.accounts.curve.to_account_info().lamports()
    )?;
    
    require!(
        price <= max_sol_cost, 
        ErrorCode::PriceExceedsMaxCost
    );

    // Transfer SOL from buyer to curve
    let transfer_sol_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.curve.to_account_info(),
    };

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_sol_ix,
        ),
        price,
    )?;

    // Transfer tokens from vault to buyer
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"token_vault",
        mint_key.as_ref(),
        &[ctx.accounts.curve.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.curve.to_account_info(),
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
