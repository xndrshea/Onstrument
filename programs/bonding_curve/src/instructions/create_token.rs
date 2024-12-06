use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, MintTo};
use crate::state::*;

#[derive(Accounts)]
#[instruction(params: CreateTokenParams)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
        space = 8 + std::mem::size_of::<BondingCurve>(),
    )]
    pub curve: Box<Account<'info, BondingCurve>>,

    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = curve,
        mint::freeze_authority = curve,
    )]
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateTokenParams {
    pub curve_config: CurveConfig,
    pub total_supply: u64,
}

pub fn handler(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
    let curve = &mut ctx.accounts.curve;
    curve.mint = ctx.accounts.mint.key();
    curve.config = params.curve_config;
    curve.bump = ctx.bumps.curve;

    // Mint initial supply
    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            &[&[
                b"bonding_curve",
                ctx.accounts.mint.key().as_ref(),
                &[ctx.bumps.curve],
            ]],
        ),
        params.total_supply,
    )?;

    Ok(())
}
