use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use super::curve_config::*;
use crate::utils::error::ErrorCode;

#[account]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub config: CurveConfig,
    pub bump: u8,
}

impl BondingCurve {
    pub fn calculate_buy_price(&self, token_vault: &Account<TokenAccount>, amount: u64, curve_lamports: u64) -> Result<u64> {
        let current_supply = token_vault.amount;
        
        // Calculate virtual SOL based on base price
        let virtual_sol = current_supply.checked_mul(self.config.base_price)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Total SOL is virtual + actual
        let total_sol = virtual_sol.checked_add(curve_lamports)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Calculate k using total SOL
        let k = total_sol.checked_mul(current_supply)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Calculate new supply after purchase (supply decreases when users buy)
        let new_supply = current_supply.checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Calculate required total SOL to maintain k
        let required_total_sol = k.checked_div(new_supply)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Price is difference in total SOL
        total_sol.checked_sub(required_total_sol)
            .ok_or(ErrorCode::MathOverflow.into())
    }

    pub fn calculate_sell_price(&self, token_vault: &Account<TokenAccount>, amount: u64, curve_lamports: u64) -> Result<u64> {
        let current_supply = token_vault.amount;
        
        // Calculate virtual SOL based on base price
        let virtual_sol = current_supply.checked_mul(self.config.base_price)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Total SOL is virtual + actual
        let total_sol = virtual_sol.checked_add(curve_lamports)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Calculate k using total SOL
        let k = total_sol.checked_mul(current_supply)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Calculate new supply after sale (supply increases when users sell)
        let new_supply = current_supply.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Calculate required total SOL to maintain k
        let required_total_sol = k.checked_div(new_supply)
            .ok_or(ErrorCode::MathOverflow)?;
            
        // Price is difference in total SOL
        required_total_sol.checked_sub(total_sol)
            .ok_or(ErrorCode::MathOverflow.into())
    }
}
