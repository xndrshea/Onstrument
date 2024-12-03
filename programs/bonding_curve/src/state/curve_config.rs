use anchor_lang::prelude::*;
use serde::{Serialize, Deserialize};

#[account]
#[derive(Default, Serialize, Deserialize)]
pub struct CurveConfig {
    pub base_price: u64,
}

impl CurveConfig {
    pub fn validate(&self) -> bool {
        // Basic validation - ensure base price is not zero
        self.base_price > 0
    }
}

