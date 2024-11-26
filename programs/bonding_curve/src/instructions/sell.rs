use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
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
        associated_token::mint = mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
    )]
    /// CHECK: This is safe as it's just holding SOL
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Sell>, amount: u64, min_sol_return: u64) -> Result<()> {
    let curve = &mut ctx.accounts.curve;
    let price = curve.calculate_sell_price(&ctx.accounts.token_vault, amount)?;
    
    require!(price >= min_sol_return, ErrorCode::PriceBelowMinReturn);

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

    // Transfer SOL from vault to seller
    **ctx.accounts.vault.try_borrow_mut_lamports()? = ctx.accounts.vault
        .lamports()
        .checked_sub(price)
        .ok_or(ErrorCode::MathOverflow)?;
    **ctx.accounts.seller.try_borrow_mut_lamports()? = ctx.accounts.seller
        .lamports()
        .checked_add(price)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
