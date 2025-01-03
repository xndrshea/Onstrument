use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};
use std::str::FromStr;
use crate::state::*;
use crate::utils::error::ErrorCode;
use crate::state::bonding_curve::MIGRATION_THRESHOLD;
use crate::utils::constants::{TRADE_FEE_BPS, FEE_COLLECTOR, MIGRATION_ADMIN};
use anchor_lang::ToAccountInfo;
use crate::instructions::price;
use crate::state::events::MigrationEvent;
use crate::instructions::price::GetPrice;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Static fee collector address
    #[account(
        mut,
        constraint = fee_collector.key() == FEE_COLLECTOR
    )]
    pub fee_collector: AccountInfo<'info>,

    /// CHECK: Static migration admin address
    #[account(
        mut,
        constraint = migration_admin.key() == MIGRATION_ADMIN
    )]
    pub migration_admin: AccountInfo<'info>,

    #[account(
        mut,
        constraint = migration_admin_token_account.owner == migration_admin.key(),
        constraint = migration_admin_token_account.mint == mint.key(),
    )]
    pub migration_admin_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        mut,
        seeds = [b"token_vault", mint.key().as_ref()],
        bump,
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

pub fn handler(ctx: Context<Buy>, amount: u64, max_sol_cost: u64, is_subscribed: bool) -> Result<()> {
    // Check migration status first
    require!(
        ctx.accounts.curve.config.migration_status == MigrationStatus::Active,
        ErrorCode::MigrationComplete
    );

    let curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    
    // Normal buy transaction first
    let base_price = ctx.accounts.curve.calculate_buy_price(
        &ctx.accounts.token_vault,
        amount,
        curve_lamports
    )?;

    let (curve_amount, fee_amount) = if !is_subscribed {
        let fee = (base_price * TRADE_FEE_BPS) / 10000;
        (base_price, fee)
    } else {
        (base_price, 0)
    };

    // Check total cost against max_sol_cost
    let total_cost = curve_amount.checked_add(fee_amount)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    require!(total_cost <= max_sol_cost, ErrorCode::PriceExceedsMaxCost);

    // Transfer SOL to curve
    let transfer_sol_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.curve.to_account_info(),
    };

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_sol_ix,
        ),
        curve_amount,
    )?;

    // Transfer fee if applicable
    if fee_amount > 0 {
        let transfer_fee_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.fee_collector.to_account_info(),
        };

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_fee_ix,
            ),
            fee_amount,
        )?;
    }

    // Transfer tokens to buyer
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            &[&[
                b"bonding_curve",
                ctx.accounts.mint.key().as_ref(),
                &[ctx.bumps.curve],
            ]],
        ),
        amount,
    )?;

    // NOW check if we need to migrate with the NEW balance
    let new_curve_lamports = ctx.accounts.curve.to_account_info().lamports();
    if new_curve_lamports >= MIGRATION_THRESHOLD {
        // Reload token vault to get current balance after previous transfer
        ctx.accounts.token_vault.reload()?;
        let vault_balance = ctx.accounts.token_vault.amount;
        
        // Send remaining tokens to admin
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.migration_admin_token_account.to_account_info(),
                    authority: ctx.accounts.curve.to_account_info(),
                },
                &[&[
                    b"bonding_curve",
                    ctx.accounts.mint.key().as_ref(),
                    &[ctx.bumps.curve],
                ]],
            ),
            vault_balance,  // Use reloaded balance
        )?;

        // Send all SOL to admin
        let all_lamports = ctx.accounts.curve.to_account_info().lamports();
        **ctx.accounts.curve.to_account_info().try_borrow_mut_lamports()? = 0;
        **ctx.accounts.migration_admin.to_account_info().try_borrow_mut_lamports()? = ctx
            .accounts
            .migration_admin
            .to_account_info()
            .lamports()
            .checked_add(all_lamports)
            .unwrap();

        // Update migration status
        ctx.accounts.curve.config.migration_status = MigrationStatus::Migrated;

        let effective_price = 1;
        
        emit!(MigrationEvent {
            mint: ctx.accounts.mint.key(),
            real_sol_amount: new_curve_lamports,
            virtual_sol_amount: VIRTUAL_SOL_AMOUNT,
            token_amount: vault_balance,  // Use the saved balance
            effective_price,
            developer: ctx.accounts.curve.config.developer,
            is_subscribed: ctx.accounts.curve.config.is_subscribed
        });
    }

    Ok(())
}
