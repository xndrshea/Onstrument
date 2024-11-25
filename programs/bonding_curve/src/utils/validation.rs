use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::utils::error::ErrorCode;

pub fn verify_token_balance(token_account: &Account<TokenAccount>, expected: u64) -> Result<()> {
    require!(
        token_account.amount == expected,
        ErrorCode::BalanceMismatch
    );
    Ok(())
}