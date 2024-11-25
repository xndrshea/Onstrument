use anchor_lang::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    Default
)]
pub enum CurveType {
    #[default]
    Linear,
    Exponential,
    Logarithmic,
}

#[account]
#[derive(Default, Serialize, Deserialize)]
pub struct CurveConfig {
    pub curve_type: CurveType,
    pub base_price: u64,
    pub slope: u64,
    pub exponent: u64,
    pub log_base: u64,
}

impl CurveConfig {
    pub fn validate(&self) -> bool {
        match self.curve_type {
            CurveType::Linear => true,
            CurveType::Exponential => true,
            CurveType::Logarithmic => true,
        }
    }
}

