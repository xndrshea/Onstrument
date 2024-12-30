use anchor_lang::prelude::*;

#[event]
pub struct MigrationEvent {
    pub mint: Pubkey,
    pub real_sol_amount: u64,
    pub virtual_sol_amount: u64,
    pub token_amount: u64,
    pub effective_price: u64,
    pub developer: Pubkey,
    pub is_subscribed: bool,
} 