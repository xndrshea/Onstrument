use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Transfer, Mint},
};

declare_id!("HWy5j9JEBQedpxgvtYHY2BbvcJE774NaKSGfSUpR6GEM");

#[program]
pub mod bonding_curve {
    use super::*;

    pub fn initialize_curve(
        ctx: Context<InitializeCurve>,
        config: CurveConfig,
    ) -> Result<()> {
        require!(config.validate(), ErrorCode::InvalidCurveConfig);
        
        let curve = &mut ctx.accounts.curve;
        curve.authority = ctx.accounts.authority.key();
        curve.mint = ctx.accounts.mint.key();
        curve.config = config;
        curve.total_supply = ctx.accounts.mint.supply;
        curve.bump = ctx.bumps.curve;
        Ok(())
    }

    pub fn buy(
        ctx: Context<Buy>,
        amount: u64,
        max_sol_cost: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let curve = &ctx.accounts.curve;
        let price = curve.calculate_price(amount, false)?;
        require!(price <= max_sol_cost, ErrorCode::SlippageExceeded);

        // Transfer SOL from buyer to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            price,
        )?;

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
                    &[curve.bump],
                ]],
            ),
            amount,
        )?;

        emit!(TradeEvent {
            mint: ctx.accounts.mint.key(),
            user: ctx.accounts.buyer.key(),
            amount,
            sol_amount: price,
            is_buy: true,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CurveConfig {
    pub curve_type: CurveType,
    pub base_price: u64,
    pub slope: Option<u64>,
    pub exponent: Option<u64>,
    pub log_base: Option<u64>,
}

impl CurveConfig {
    pub fn validate(&self) -> bool {
        match self.curve_type {
            CurveType::Linear => self.slope.is_some(),
            CurveType::Exponential => self.exponent.is_some(),
            CurveType::Logarithmic => self.log_base.is_some(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum CurveType {
    Linear,
    Exponential,
    Logarithmic,
}

#[account]
pub struct BondingCurve {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub config: CurveConfig,
    pub total_supply: u64,
    pub bump: u8,
}

impl BondingCurve {
    pub fn calculate_price(&self, amount: u64, is_selling: bool) -> Result<u64> {
        let supply_ratio = if is_selling {
            (self.total_supply.checked_add(amount)
                .ok_or(ErrorCode::MathOverflow)?) as f64 / self.total_supply as f64
        } else {
            self.total_supply as f64 / self.total_supply as f64
        };

        let base_price = self.config.base_price as f64;
        let price = match self.config.curve_type {
            CurveType::Linear => {
                let slope = self.config.slope.unwrap() as f64;
                base_price + (slope * supply_ratio)
            },
            CurveType::Exponential => {
                let exponent = self.config.exponent.unwrap() as f64;
                base_price * (exponent * supply_ratio).exp()
            },
            CurveType::Logarithmic => {
                let log_base = self.config.log_base.unwrap() as f64;
                base_price * (1.0 + log_base * supply_ratio).ln()
            },
        };

        Ok((price * 1e9) as u64)
    }
}

#[derive(Accounts)]
pub struct InitializeCurve<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<BondingCurve>(),
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    /// CHECK: This is safe as it's just receiving SOL
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub sol_amount: u64,
    pub is_buy: bool,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid curve configuration")]
    InvalidCurveConfig,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
}

