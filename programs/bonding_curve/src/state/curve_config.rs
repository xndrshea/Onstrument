use anchor_lang::prelude::*;
use serde::{Serialize, Deserialize};
use solana_program::pubkey::Pubkey;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub enum MigrationStatus {
    #[default]
    Active,
    Migrated,
    Failed
}

#[account]
#[derive(Default, Serialize, Deserialize)]
pub struct CurveConfig {
    pub migration_status: MigrationStatus,
    pub is_subscribed: bool,
    pub developer: Pubkey,
}

impl CurveConfig {
    pub fn validate(&self) -> bool {
        true // No need to validate virtual_sol anymore
    }
}

