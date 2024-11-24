use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Transfer, Mint},
};

declare_id!("HWy5j9JEBQedpxgvtYHY2BbvcJE774NaKSGfSUpR6GEM");

#[program]
pub mod bonding_curve {
    use super::*;

    // Allows users to buy tokens from the bonding curve
    // Takes amount of tokens to buy and max SOL willing to spend
    pub fn buy(
        ctx: Context<Buy>,
        amount: u64,
        max_sol_cost: u64,
    ) -> Result<()> {
        let curve = &mut ctx.accounts.curve;
        let price = curve.calculate_price(amount, false)?;
        require!(price <= max_sol_cost, ErrorCode::SlippageExceeded);

        // Transfer SOL from buyer to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            price,
        )?;

        // Transfer tokens from vault to buyer
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

    // Allows users to sell tokens back to the bonding curve
    // Takes amount of tokens to sell and minimum SOL expected in return
    pub fn sell(
        ctx: Context<Sell>, 
        amount: u64, 
        min_sol_return: u64
    ) -> Result<()> {
        let curve = &mut ctx.accounts.curve;
        
        // Verify current balances
        curve.verify_balances(&ctx.accounts.token_vault, &ctx.accounts.vault)?;
        
        // Calculate SOL return amount
        let sol_return = curve.calculate_price(amount, true)?;
        require!(
            sol_return >= min_sol_return, 
            ErrorCode::SlippageExceeded
        );

        // Verify vault has enough SOL
        require!(
            ctx.accounts.vault.lamports() >= sol_return,
            ErrorCode::InsufficientLiquidity
        );

        // Transfer tokens from seller to vault
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            amount,
        )?;

        // Transfer SOL from vault to seller
        **ctx.accounts.vault.try_borrow_mut_lamports()? = ctx
            .accounts
            .vault
            .lamports()
            .checked_sub(sol_return)
            .ok_or(ErrorCode::MathOverflow)?;
        
        **ctx.accounts.seller.try_borrow_mut_lamports()? = ctx
            .accounts
            .seller
            .lamports()
            .checked_add(sol_return)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update balances
        curve.update_balances(
            amount as i64,       // Increase token balance
            -(sol_return as i64) // Decrease SOL balance
        )?;

        emit!(TradeEvent {
            mint: ctx.accounts.mint.key(),
            user: ctx.accounts.seller.key(),
            amount,
            sol_amount: sol_return,
            is_buy: false,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn get_price_info(
        ctx: Context<GetPriceInfo>,
        amount: u64,
        is_buy: bool,
    ) -> Result<PriceInfo> {
        let curve = &ctx.accounts.curve;
        let price = curve.calculate_price(amount, !is_buy)?;
        let price_impact = curve.calculate_price_impact(amount)?;
        
        Ok(PriceInfo {
            price,
            price_impact,
            total_cost: price.checked_mul(amount).ok_or(ErrorCode::MathOverflow)?,
        })
    }

    #[view]
    pub fn get_price_quote(
        ctx: Context<GetPriceQuote>,
        amount: u64,
        is_buy: bool,
    ) -> Result<PriceQuote> {
        let curve = &ctx.accounts.curve;
        let spot_price = curve.calculate_price(amount, is_buy)?;
        let price_impact = curve.calculate_price_impact(amount)?;
        let total_price = spot_price
            .checked_mul(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(PriceQuote {
            spot_price,
            total_price,
            price_impact,
        })
    }

    pub fn create_token_with_curve(
        ctx: Context<CreateTokenWithCurve>,
        params: CreateTokenParams,
    ) -> Result<()> {
        // 1. Validate parameters
        require!(params.initial_supply > 0, ErrorCode::InvalidAmount);
        require!(params.curve_config.validate(), ErrorCode::InvalidCurveConfig);

        // 2. Mint initial supply to creator
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            params.initial_supply,
        )?;

        // 3. Initialize the curve account
        let curve = &mut ctx.accounts.curve;
        curve.authority = ctx.accounts.creator.key();
        curve.mint = ctx.accounts.mint.key();
        curve.config = params.curve_config;
        curve.total_supply = params.initial_supply;
        curve.bump = *ctx.bumps.get("curve").unwrap();

        // 4. Transfer initial supply to token vault
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            params.initial_supply,
        )?;

        // 5. Emit creation event
        emit!(TokenCreatedEvent {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            initial_supply: params.initial_supply,
            curve_type: params.curve_config.curve_type,
            base_price: params.curve_config.base_price,
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
        // Just use the curve config directly
        match self.config.curve_type {
            CurveType::Linear => {
                let slope = self.config.slope
                    .ok_or(ErrorCode::InvalidCurveConfig)?;
                
                // price = base_price + (slope * supply)
                let price_component = slope
                    .checked_mul(self.total_supply)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_add(self.config.base_price)
                    .ok_or(ErrorCode::MathOverflow)?;

                price_component
                    .checked_mul(amount)
                    .ok_or(ErrorCode::MathOverflow)?
            },
            
            CurveType::Exponential => {
                let exponent = self.config.exponent
                    .ok_or(ErrorCode::InvalidCurveConfig)?;
                
                // For exponential: price = base_price * (1 + exponent)^supply
                // We use fixed point math since we can't use floating point
                let exp_factor = exponent
                    .checked_mul(self.total_supply)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10000) // Assuming exponent is scaled by 10000
                    .ok_or(ErrorCode::MathOverflow)?;

                self.config.base_price
                    .checked_mul(exp_factor)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(amount)
                    .ok_or(ErrorCode::MathOverflow)?
            },
            
            CurveType::Logarithmic => {
                let log_base = self.config.log_base
                    .ok_or(ErrorCode::InvalidCurveConfig)?;
                
                // For logarithmic: price = base_price * log(1 + log_base * supply)
                // We use fixed point math approximation
                let log_factor = log_base
                    .checked_mul(self.total_supply)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10000) // Assuming log_base is scaled by 10000
                    .ok_or(ErrorCode::MathOverflow)?;

                self.config.base_price
                    .checked_mul(log_factor)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_mul(amount)
                    .ok_or(ErrorCode::MathOverflow)?
            },
        }
    }

    pub fn calculate_price_impact(&self, amount: u64) -> Result<u64> {
        // Simple price impact calculation - can be made more sophisticated
        let base_supply = self.total_supply;
        let new_supply = base_supply.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let impact = (new_supply
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_supply)
            .ok_or(ErrorCode::MathOverflow)?)
            .checked_sub(100)
            .ok_or(ErrorCode::MathOverflow)?;
        
        Ok(impact)
    }
}

#[derive(Accounts)]
pub struct InitializeCurve<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = mint.supply > 0,
        constraint = mint.decimals <= 9,  // Prevent precision issues
        constraint = mint.freeze_authority.is_none() || 
                    mint.freeze_authority.unwrap() == authority.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<BondingCurve>(),
        seeds = [b"bonding_curve".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = curve,
        seeds = [b"token_vault".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        seeds = [b"sol_vault".as_ref(), mint.key().as_ref()],
        bump,
        space = 8,
        constraint = sol_vault.lamports() == 0,
    )]
    /// CHECK: Empty account for receiving SOL
    pub sol_vault: AccountInfo<'info>,

    // Required system accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = token_vault.mint == mint.key(),
        constraint = token_vault.owner == curve.key(),
        constraint = token_vault.amount >= amount,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.mint == mint.key(),
        constraint = buyer_token_account.owner == buyer.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
    )]
    /// CHECK: This is safe as it's just receiving SOL
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = authority,
        mint::supply = 0,
    )]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = seller_token_account.mint == mint.key(),
        constraint =  seller_token_account.owner == seller.key(),
        constraint = seller_token_account.amount >= amount, // Ensure seller has enough tokens
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_vault.mint == mint.key(),
        constraint = token_vault.owner == curve.key(),
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"sol_vault", mint.key().as_ref()],
        bump,
        constraint = vault.lamports() >= min_sol_return, // Ensure vault has enough SOL
    )]
    /// CHECK: This is safe as it's just for SOL transfers
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PriceInfo {
    pub price: u64,
    pub price_impact: u64,
    pub total_cost: u64,
}

#[derive(Accounts)]
pub struct GetPriceInfo<'info> {
    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PriceQuote {
    pub spot_price: u64,
    pub total_price: u64,
    pub price_impact: u64,
}

#[derive(Accounts)]
pub struct GetPriceQuote<'info> {
    pub mint: Account<'info, Mint>,
    
    #[account(
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = curve.bump,
    )]
    pub curve: Account<'info, BondingCurve>,
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
    #[msg("Invalid mint configuration")]
    InvalidMint,
    #[msg("Invalid curve configuration")]
    InvalidCurveConfig,
    #[msg("Curve is frozen")]
    CurveFrozen,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Balance mismatch")]
    BalanceMismatch,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Balance mismatch between account and stored value")]
    BalanceMismatch,
    #[msg("Insufficient balance for operation")]
    InsufficientBalance,
}

#[derive(Accounts)]
pub struct CreateTokenWithCurve<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = 9,
        mint::authority = creator.key(),
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<BondingCurve>(),
        seeds = [b"bonding_curve".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = curve,
        seeds = [b"token_vault".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        seeds = [b"sol_vault".as_ref(), mint.key().as_ref()],
        bump,
        space = 8
    )]
    /// CHECK: Empty account for receiving SOL
    pub sol_vault: AccountInfo<'info>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateTokenParams {
    pub name: String,
    pub symbol: String,
    pub initial_supply: u64,
    pub curve_config: CurveConfig,
}

#[event]
pub struct TokenCreatedEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub initial_supply: u64,
    pub curve_type: CurveType,
    pub base_price: u64,
    pub timestamp: i64,
}
