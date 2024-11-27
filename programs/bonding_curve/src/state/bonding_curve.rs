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
        let current_sol = curve_lamports;
        let base_price = self.config.base_price
            .checked_mul(101)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)?;

        match self.config.curve_type {
            CurveType::Linear => self.calculate_linear_price(current_supply, current_sol, amount, base_price),
            CurveType::Exponential => self.calculate_exponential_price(current_supply, current_sol, amount, base_price),
            CurveType::Logarithmic => self.calculate_logarithmic_price(current_supply, current_sol, amount, base_price),
        }
    }

    pub fn calculate_sell_price(&self, token_vault: &Account<TokenAccount>, amount: u64, curve_lamports: u64) -> Result<u64> {
        let current_supply = token_vault.amount;
        let current_sol = curve_lamports;
        let base_price = self.config.base_price;

        match self.config.curve_type {
            CurveType::Linear => self.calculate_linear_price(current_supply, current_sol, amount, base_price),
            CurveType::Exponential => self.calculate_exponential_price(current_supply, current_sol, amount, base_price),
            CurveType::Logarithmic => self.calculate_logarithmic_price(current_supply, current_sol, amount, base_price),
        }
    }

    fn calculate_linear_price(&self, current_supply: u64, current_sol: u64, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Linear,
            ErrorCode::InvalidCurveConfig
        );
        let slope = self.config.slope;
        let price_component = slope
            .checked_mul(current_supply)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(base_price)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(price_component
            .checked_mul(amount)
            .ok_or(ErrorCode::MathOverflow)?)
    }

    fn calculate_exponential_price(&self, current_supply: u64, current_sol: u64, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Exponential,
            ErrorCode::InvalidCurveConfig
        );
        let exponent = self.config.exponent;
        
        // Calculate (1 + supply/10000)^exponent * base_price * amount
        let supply_factor = current_supply
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let mut price_multiplier = 1u64;
        for _ in 0..exponent {
            price_multiplier = price_multiplier
                .checked_mul(supply_factor)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        
        Ok(price_multiplier
            .checked_mul(base_price)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(amount)
            .ok_or(ErrorCode::MathOverflow)?)
    }

    fn calculate_logarithmic_price(&self, current_supply: u64, current_sol: u64, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Logarithmic,
            ErrorCode::InvalidCurveConfig
        );
        let log_base = self.config.log_base;
        
        let supply_plus_one = current_supply
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let log_factor = calculate_integer_ln(supply_plus_one)?
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(log_base)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let price_multiplier = log_factor
            .checked_add(100)
            .ok_or(ErrorCode::MathOverflow)?;
        
        base_price
            .checked_mul(price_multiplier)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(amount)
            .ok_or(ErrorCode::MathOverflow.into())
    }
}

// Helper function to calculate integer natural logarithm
fn calculate_integer_ln(x: u64) -> Result<u64> {
    if x == 0 {
        return Err(ErrorCode::MathOverflow.into());
    }
    
    // Approximate ln(x) using integer math
    let mut result = 0u64;
    let mut value = x;
    
    while value >= 271828 { // e^5.6 ≈ 271828
        result = result.checked_add(560)
            .ok_or(ErrorCode::MathOverflow)?; // 5.6 * 100
        value = value.checked_div(271828)
            .ok_or(ErrorCode::MathOverflow)?;
    }
    
    Ok(result)
}
