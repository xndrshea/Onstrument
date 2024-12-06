use anchor_lang::prelude::*;
use serde::{Serialize, Deserialize};

#[account]
#[derive(Default, Serialize, Deserialize)]
pub struct CurveConfig {
    pub virtual_sol: u64,
}

impl CurveConfig {
    pub fn validate(&self) -> bool {
        msg!("Using CurveConfig with virtual_sol field");
        self.virtual_sol > 0
    }
}

