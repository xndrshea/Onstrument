use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, MintTo};
use crate::state::*;

#[derive(Accounts)]
#[instruction(params: CreateTokenParams)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    // Each curve is unique for a token, using creator + token_seed ensures uniqueness
    #[account(
        init,
        payer = creator,
        seeds = [
            b"bonding_curve",
            creator.key().as_ref(),
            params.token_seed.as_ref()
        ],
        bump,
        space = 8 + std::mem::size_of::<BondingCurve>(),
    )]
    pub curve: Box<Account<'info, BondingCurve>>,

    // Mint PDA is derived from creator + token_seed to allow multiple tokens per creator
    #[account(
        init,
        payer = creator,
        seeds = [
            b"token_mint",
            creator.key().as_ref(),
            params.token_seed.as_ref()
        ],
        bump,
        mint::decimals = 6,
        mint::authority = curve,
    )]
    pub mint: Box<Account<'info, Mint>>,

    // Token vault follows same pattern for consistency
    #[account(
        init,
        payer = creator,
        seeds = [
            b"token_vault",
            creator.key().as_ref(),
            params.token_seed.as_ref()
        ],
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
    /// Unique identifier for this token, can be name/symbol
    /// Allows creators to make multiple tokens
    pub token_seed: String,
}

pub fn handler(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
    let curve = &mut ctx.accounts.curve;
    curve.mint = ctx.accounts.mint.key();
    curve.config = params.curve_config;
    curve.config.developer = ctx.accounts.creator.key();
    curve.bump = ctx.bumps.curve;
    
    // Clone the token_seed before using it
    let token_seed = params.token_seed.clone();
    curve.token_seed = token_seed;

    // Mint initial supply to vault
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
                ctx.accounts.creator.key().as_ref(),
                params.token_seed.as_ref(),  // Now we can use params.token_seed
                &[ctx.bumps.curve],
            ]],
        ),
        params.total_supply,
    )?;

    Ok(())
}
