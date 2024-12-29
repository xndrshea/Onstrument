use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint, Transfer};
use solana_program::system_instruction;
use crate::state::*;
use crate::utils::error::ErrorCode;
use crate::state::bonding_curve::{MIGRATION_THRESHOLD, VIRTUAL_SOL_AMOUNT};

const DEV_FEE_LAMPORTS: u64 = 3_000_000_000; // 3 SOL
const RAYDIUM_CP_PROGRAM_ID: &str = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
const RAYDIUM_POOL_CREATION_FEE: u64 = 150_000_000; // 0.15 SOL

#[derive(Accounts)]
pub struct MigrateLiquidity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
        constraint = curve.config.migration_status == MigrationStatus::Active,
        constraint = curve.to_account_info().lamports() >= MIGRATION_THRESHOLD
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// CHECK: Validated by Raydium program
    #[account(mut)]
    pub raydium_pool: AccountInfo<'info>,

    /// CHECK: Validated by Raydium program
    #[account(mut)]
    pub raydium_token_vault: AccountInfo<'info>,

    /// CHECK: Validated by Raydium program
    #[account(mut)]
    pub raydium_sol_vault: AccountInfo<'info>,

    /// CHECK: Raydium AMM program
    pub raydium_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// Developer's SOL account to receive fee if subscribed
    /// CHECK: Only receives SOL if subscribed
    #[account(
        mut,
        constraint = (!curve.config.is_subscribed || developer.key() == curve.config.developer)
    )]
    pub developer: AccountInfo<'info>,
}

pub fn handler(ctx: Context<MigrateLiquidity>) -> Result<()> {
    let curve = &mut ctx.accounts.curve;
    let curve_lamports = curve.to_account_info().lamports();
    let total_tokens = ctx.accounts.token_vault.amount;
    
    // Calculate rent-exempt balance
    let rent = Rent::get()?;
    let rent_exempt_balance = rent.minimum_balance(curve.to_account_info().data_len());
    let available_liquidity = curve_lamports
        .checked_sub(rent_exempt_balance)
        .ok_or(ErrorCode::InsufficientLiquidity)?;

    // Calculate how much SOL will actually be in Raydium pool (LESS fees)
    let raydium_sol = if curve.config.is_subscribed {
        available_liquidity
            .checked_sub(DEV_FEE_LAMPORTS)
            .and_then(|amount| amount.checked_sub(RAYDIUM_POOL_CREATION_FEE))
            .ok_or(ErrorCode::InsufficientLiquidity)?
    } else {
        available_liquidity
            .checked_sub(RAYDIUM_POOL_CREATION_FEE)
            .ok_or(ErrorCode::InsufficientLiquidity)?
    };

    // Calculate required token amount for price consistency
    // Current k = (real_sol + virtual_sol) * total_tokens
    // New k = raydium_sol * adjusted_tokens  // raydium_sol is AFTER removing the fee
    // Therefore: adjusted_tokens = (real_sol + virtual_sol) * total_tokens / raydium_sol
    let current_effective_sol = curve_lamports
        .checked_add(VIRTUAL_SOL_AMOUNT)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    
    let raydium_tokens = (current_effective_sol as u128)
        .checked_mul(total_tokens as u128)
        .ok_or(error!(ErrorCode::MathOverflow))?
        .checked_div(raydium_sol as u128) // Using raydium_sol which is AFTER fee deduction
        .ok_or(error!(ErrorCode::MathOverflow))?;

    require!(
        raydium_tokens <= total_tokens as u128,
        ErrorCode::MathOverflow
    );

    // Transfer adjusted token amount to Raydium pool
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.raydium_token_vault.to_account_info(),
                authority: curve.to_account_info(),
            },
            &[&[
                b"bonding_curve",
                ctx.accounts.mint.key().as_ref(),
                &[curve.bump],
            ]],
        ),
        raydium_tokens as u64,
    )?;

    // Transfer SOL to Raydium pool
    let transfer_ix = system_instruction::transfer(
        &curve.key(),
        &ctx.accounts.raydium_sol_vault.key(),
        raydium_sol
    );

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            curve.to_account_info(),
            ctx.accounts.raydium_sol_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[&[
            b"bonding_curve",
            ctx.accounts.mint.key().as_ref(),
            &[curve.bump],
        ]],
    )?;

    // If subscribed, transfer dev fee
    if curve.config.is_subscribed {
        let dev_fee_ix = system_instruction::transfer(
            &curve.key(),
            &ctx.accounts.developer.key(),
            DEV_FEE_LAMPORTS
        );

        anchor_lang::solana_program::program::invoke_signed(
            &dev_fee_ix,
            &[
                curve.to_account_info(),
                ctx.accounts.developer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[
                b"bonding_curve",
                ctx.accounts.mint.key().as_ref(),
                &[curve.bump],
            ]],
        )?;
    }

    // Mark curve as migrated
    curve.config.migration_status = MigrationStatus::Migrated;

    let init_pool_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.raydium_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new(ctx.accounts.raydium_pool.key(), false),
            AccountMeta::new(ctx.accounts.raydium_token_vault.key(), false),
            AccountMeta::new(ctx.accounts.raydium_sol_vault.key(), false),
        ],
        data: vec![
            0, // Initialize instruction
            raydium_tokens.to_le_bytes().as_ref(),
            raydium_sol.to_le_bytes().as_ref(),
            0u64.to_le_bytes().as_ref(), // immediate start
        ].concat(),
    };

    anchor_lang::solana_program::program::invoke(
        &init_pool_ix,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.raydium_pool.to_account_info(),
            ctx.accounts.raydium_token_vault.to_account_info(),
            ctx.accounts.raydium_sol_vault.to_account_info(),
        ],
    )?;

    Ok(())
} 