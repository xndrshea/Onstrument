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
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

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

pub fn handler(ctx: Context<Buy>, amount: u64, max_sol_cost: u64) -> Result<()> {
    let curve = &mut ctx.accounts.curve;
    let price = curve.calculate_buy_price(amount)?;
    
    require!(
        price <= max_sol_cost, 
        ErrorCode::PriceExceedsMaxCost
    );

    // Transfer SOL from buyer to vault
    let transfer_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
    };

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
        ),
        price,
    )?;

    // Create longer-lived values
    let mint_key = ctx.accounts.mint.key();
    let bump = [curve.bump];
    let seeds = [
        b"bonding_curve",
        mint_key.as_ref(),
        &bump,
    ];
    let signer_seeds = [&seeds[..]];
    
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: curve.to_account_info(),
        },
        &signer_seeds,
    );
    
    anchor_spl::token::transfer(transfer_ctx, amount)?;

    curve.total_supply = curve.total_supply.checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    Ok(())
}
