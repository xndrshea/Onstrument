use anchor_lang::prelude::*;
use super::curve_config::*;
use crate::utils::error::ErrorCode;

#[account]
pub struct BondingCurve {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub config: CurveConfig,
    pub total_supply: u64,
    pub bump: u8,
}

impl BondingCurve {
    pub fn calculate_buy_price(&self, amount: u64) -> Result<u64> {
        self.calculate_price(amount, false)
    }

    pub fn calculate_sell_price(&self, amount: u64) -> Result<u64> {
        self.calculate_price(amount, true)
    }

    pub fn calculate_price_impact(&self, amount: u64) -> Result<u64> {
        let new_supply = self.total_supply
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let impact = (new_supply
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.total_supply)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_sub(100))
            .ok_or(ErrorCode::MathOverflow)?;
        
        Ok(impact)
    }

    pub fn calculate_price(&self, amount: u64, is_sell: bool) -> Result<u64> {
        let base_price = match is_sell {
            true => self.config.base_price,
            false => self.config.base_price
                .checked_mul(101)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(100)
                .ok_or(ErrorCode::MathOverflow)?,
        };

        match self.config.curve_type {
            CurveType::Linear => self.calculate_linear_price(amount, base_price),
            CurveType::Exponential => self.calculate_exponential_price(amount, base_price),
            CurveType::Logarithmic => self.calculate_logarithmic_price(amount, base_price),
        }
    }

    fn calculate_linear_price(&self, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Linear,
            ErrorCode::InvalidCurveConfig
        );
        let slope = self.config.slope;
        let price_component = slope
            .checked_mul(self.total_supply)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(base_price)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(price_component
            .checked_mul(amount)
            .ok_or(ErrorCode::MathOverflow)?)
    }

    fn calculate_exponential_price(&self, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Exponential,
            ErrorCode::InvalidCurveConfig
        );
        let exponent = self.config.exponent;
        
        // Calculate (1 + supply/10000)^exponent * base_price * amount
        let supply_factor = self.total_supply
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Using integer power for simplicity
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

    fn calculate_logarithmic_price(&self, amount: u64, base_price: u64) -> Result<u64> {
        require!(
            self.config.curve_type == CurveType::Logarithmic,
            ErrorCode::InvalidCurveConfig
        );
        let log_base = self.config.log_base;
        
        // Using simplified logarithmic formula: base_price * (1 + ln(supply + 1)/log_base) * amount
        // Note: Since we can't use floating point math, we'll approximate using integer math
        let supply_plus_one = self.total_supply
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Approximate natural log using integer math (multiply by 100 for 2 decimal precision)
        let log_factor = calculate_integer_ln(supply_plus_one)?
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(log_base)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let price_multiplier = log_factor
            .checked_add(100) // Add 100 to represent 1.0
            .ok_or(ErrorCode::MathOverflow)?;
        
        base_price
            .checked_mul(price_multiplier)
            .ok_or::<anchor_lang::error::Error>(ErrorCode::MathOverflow.into())?
            .checked_div(100) // Divide by 100 to normalize the precision
            .ok_or::<anchor_lang::error::Error>(ErrorCode::MathOverflow.into())?
            .checked_mul(amount)
            .ok_or::<anchor_lang::error::Error>(ErrorCode::MathOverflow.into())
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
