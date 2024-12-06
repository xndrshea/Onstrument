use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::utils::error::ErrorCode;
use crate::state::curve_config::CurveConfig;

const MIGRATION_THRESHOLD: u64 = 80_000_000_000; // 80 SOL in lamports
const PRECISION_FACTOR: u64 = 1_000_000; // 6 decimal places

#[account]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub config: CurveConfig,
    pub bump: u8,
}

impl BondingCurve {
    pub fn get_effective_amounts(&self, token_vault: &Account<TokenAccount>, curve_lamports: u64) -> Result<(u64, u64)> {
        // We just need total effective SOL for price calculations
        let effective_sol = curve_lamports
            .checked_add(self.config.virtual_sol)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        Ok((effective_sol, token_vault.amount))
    }

    pub fn calculate_buy_price(&self, token_vault: &Account<TokenAccount>, buy_amount: u64, curve_lamports: u64) -> Result<u64> {
        let (effective_sol, total_tokens) = self.get_effective_amounts(token_vault, curve_lamports)?;

        // Convert to u128 before scaling to prevent precision loss
        let effective_sol_u128 = effective_sol as u128;
        let total_tokens_u128 = total_tokens as u128;

        // Calculate k = total_tokens * effective_sol with full precision
        let k = total_tokens_u128
            .checked_mul(effective_sol_u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate new token balance with full precision
        let new_token_amount = total_tokens_u128
            .checked_sub(buy_amount as u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate new SOL amount maintaining precision
        let new_sol_amount = k
            .checked_div(new_token_amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate price difference while maintaining precision
        let price_difference = new_sol_amount
            .checked_sub(effective_sol_u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Convert back to u64, checking for overflow
        if price_difference > u64::MAX as u128 {
            return Err(error!(ErrorCode::MathOverflow));
        }
        
        Ok(price_difference as u64)
    }

    pub fn calculate_sell_price(&self, token_vault: &Account<TokenAccount>, sell_amount: u64, curve_lamports: u64) -> Result<u64> {
        let (effective_sol, total_tokens) = self.get_effective_amounts(token_vault, curve_lamports)?;

        // Convert to u128 before scaling to prevent precision loss
        let effective_sol_u128 = effective_sol as u128;
        let total_tokens_u128 = total_tokens as u128;
  

        // Calculate k = total_tokens * effective_sol with full precision
        let k = total_tokens_u128
            .checked_mul(effective_sol_u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate new token balance with full precision
        let new_token_amount = total_tokens_u128
            .checked_add(sell_amount as u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate new SOL amount maintaining precision
        let new_sol_amount = k
            .checked_div(new_token_amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Calculate price difference while maintaining precision
        let price_difference = effective_sol_u128
            .checked_sub(new_sol_amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        // Convert back to u64, checking for overflow
        if price_difference > u64::MAX as u128 {
            return Err(error!(ErrorCode::MathOverflow));
        }
        
        Ok(price_difference as u64)
    }
}