use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,
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
    #[msg("Invalid metadata address")]
    InvalidMetadataAddress,
    #[msg("Metadata creation failed")]
    MetadataCreationFailed,
    #[msg("Invalid account owner")]
    InvalidOwner,
    #[msg("Invalid metadata program")]
    InvalidMetadataProgram,
    #[msg("Migration required before operation")]
    MigrationRequired,
    #[msg("Invalid migration admin")]
    InvalidMigrationAdmin,
}
