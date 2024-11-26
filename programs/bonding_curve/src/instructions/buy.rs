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
        bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
    )]
    /// CHECK: This is safe as it's just holding SOL
    pub sol_vault: AccountInfo<'info>,

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
        amount
    )?;
    
    require!(
        price <= max_sol_cost, 
        ErrorCode::PriceExceedsMaxCost
    );

    // Transfer SOL from buyer to vault
    let transfer_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.sol_vault.to_account_info(),
    };

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
        ),
        price,
    )?;

    // Create longer-lived values before CpiContext
    let curve_bump = ctx.accounts.curve.bump;
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"bonding_curve" as &[u8],
        mint_key.as_ref(),
        &[curve_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.curve.to_account_info(),
        },
        signer_seeds,
    );
    
    anchor_spl::token::transfer(transfer_ctx, amount)?;

    Ok(())
}
