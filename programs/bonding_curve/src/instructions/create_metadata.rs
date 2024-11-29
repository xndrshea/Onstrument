use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::utils::metadata::{create_metadata_ix, validate_metadata_account};
use crate::state::BondingCurve;

#[derive(Accounts)]
#[instruction(params: CreateMetadataParams)]
pub struct CreateMetadata<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// The curve PDA that controls the token
    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
    )]
    pub curve: Box<Account<'info, BondingCurve>>,

    /// CHECK: Validated in instruction
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    /// CHECK: Required for metadata creation
    pub metadata_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMetadataParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

pub fn handler(ctx: Context<CreateMetadata>, params: CreateMetadataParams) -> Result<()> {
    // Validate metadata account
    validate_metadata_account(
        &ctx.accounts.metadata,
        &ctx.accounts.metadata_program,
        &ctx.accounts.system_program,
        &ctx.accounts.mint.key(),
    )?;

    // Create metadata account using program as authority
    let metadata_ix = create_metadata_ix(
        ctx.accounts.metadata.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.curve.key(),  // Curve as mint authority
        ctx.accounts.creator.key(),
        ctx.accounts.curve.key(),  // Curve as update authority
        params.name,
        params.symbol,
        params.uri,
    )?;

    // Store the mint key to extend its lifetime
    let mint_key = ctx.accounts.mint.key();
    
    // Get the curve PDA signer seeds
    let curve_seeds = &[
        b"bonding_curve",
        mint_key.as_ref(),
        &[ctx.accounts.curve.bump],
    ];

    // Invoke with signer seeds
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
        &[curve_seeds],
    )?;

    Ok(())
}
