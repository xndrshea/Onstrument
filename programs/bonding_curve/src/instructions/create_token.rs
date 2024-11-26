use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Mint, MintTo},
    associated_token::AssociatedToken,
};
use crate::state::*;
use crate::utils::*;
use crate::utils::error::ErrorCode;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateTokenParams {
    pub name: String,
    pub symbol: String,
    pub initial_supply: u64,
    pub metadata_uri: String,
    pub curve_config: CurveConfig,
}

#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = 9,
        mint::authority = curve,
        mint::freeze_authority = curve,
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
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
        space = 0,
    )]
    /// CHECK: This is safe as it's just holding SOL
    pub sol_vault: AccountInfo<'info>,

    /// CHECK: Validated in instruction
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    /// CHECK: Required for metadata creation
    pub metadata_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
    // Validate parameters
    require!(params.initial_supply > 0, ErrorCode::InvalidAmount);
    require!(params.curve_config.validate(), ErrorCode::InvalidCurveConfig);

    // Initialize curve account
    let curve = &mut ctx.accounts.curve;
    curve.mint = ctx.accounts.mint.key();
    curve.config = params.curve_config;
    curve.bump = ctx.bumps.curve;
  

    // Create metadata
    let metadata_ix = create_metadata_ix(
        ctx.accounts.metadata.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.curve.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.curve.key(),
        params.name,
        params.symbol,
        params.metadata_uri,
    )?;

    let mint_key = ctx.accounts.mint.key();
    anchor_lang::solana_program::program::invoke_signed(
        &metadata_ix,
        &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.curve.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.metadata_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        &[&[
            b"bonding_curve",
            mint_key.as_ref(),
            &[ctx.bumps.curve],
        ]],
    )?;

    // Mint initial supply using curve's authority
    let mint_key = ctx.accounts.mint.key();
    let curve_seeds = &[
        b"bonding_curve",
        mint_key.as_ref(),
        &[ctx.bumps.curve],
    ];
    let signer = &[&curve_seeds[..]];

    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer,
        ),
        params.initial_supply,
    )?;

    Ok(())
}
