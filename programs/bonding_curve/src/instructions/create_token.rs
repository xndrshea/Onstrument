use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Mint},
    associated_token::AssociatedToken,
};
use crate::state::*;
use crate::utils::error::ErrorCode;
use crate::utils::metadata::create_metadata_ix;
use anchor_spl::token::MintTo;
use serde::{Serialize, Deserialize};

#[derive(anchor_lang::Accounts)]
pub struct CreateTokenWithCurve<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = 9,
        mint::authority = creator,
        mint::freeze_authority = creator,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
        space = 8 + std::mem::size_of::<BondingCurve>(),
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// CHECK: Validated in instruction
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
        space = 0,
    )]
    /// CHECK: This is safe as it's just holding SOL
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Serialize, Deserialize, AnchorSerialize, AnchorDeserialize)]
pub struct CreateTokenParams {
    pub name: String,
    pub symbol: String,
    pub metadata_uri: String,
    pub initial_supply: u64,
    pub curve_config: CurveConfig,
}

pub fn handler(ctx: Context<CreateTokenWithCurve>, params: CreateTokenParams) -> Result<()> {
    require!(
        params.initial_supply > 0, 
        ErrorCode::InvalidAmount
    );
    require!(
        params.curve_config.validate(), 
        ErrorCode::InvalidCurveConfig
    );
    require!(
        params.curve_config.base_price > 0, 
        ErrorCode::InvalidCurveConfig
    );

    let curve = &mut ctx.accounts.curve;
    curve.authority = ctx.accounts.creator.key();
    curve.mint = ctx.accounts.mint.key();
    curve.config = params.curve_config;
    curve.total_supply = params.initial_supply;
    curve.bump = ctx.bumps.curve;

    let metadata_ix = create_metadata_ix(
        ctx.accounts.metadata.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.creator.key(),
        params.name,
        params.symbol,
        params.metadata_uri,
    )?;

    anchor_lang::solana_program::program::invoke(
        &metadata_ix,
        &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
    )?;

    anchor_spl::token::mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            }
        ),
        params.initial_supply,
    )?;

    Ok(())
}
