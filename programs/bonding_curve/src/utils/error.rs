use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,
    #[msg("Invalid curve parameters")]
    InvalidCurveParameters,
    #[msg("Math operation overflow")]
    MathOverflow,
    #[msg("Price exceeds maximum cost")]
    PriceExceedsMaxCost,
    #[msg("Price below minimum return")]
    PriceBelowMinReturn,
    #[msg("Balance mismatch")]
    BalanceMismatch,
    #[msg("Invalid curve configuration")]
    InvalidCurveConfig,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid token decimals")]
    InvalidDecimals,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Numeric overflow")]
    Overflow,
    #[msg("Invalid metadata address")]
    InvalidMetadataAddress,
    #[msg("Metadata creation failed")]
    MetadataCreationFailed,
}
