use anchor_lang::prelude::*;

pub const TRADE_FEE_BPS: u64 = 100; // 1%

// Define byte arrays for the public keys
const FEE_COLLECTOR_BYTES: [u8; 32] = [
    194, 73, 64, 156, 20, 86, 1, 93,
    103, 112, 193, 65, 134, 23, 207, 28,
    187, 39, 81, 4, 122, 135, 79, 54,
    8, 254, 239, 26, 243, 192, 173, 3
];

const MIGRATION_ADMIN_BYTES: [u8; 32] = [
    224, 67, 189, 212, 203, 187, 41,
    223, 118, 50, 190, 182, 44, 210,
    139, 163, 109, 249, 134, 115, 45,
    43, 110, 126, 162, 220, 181, 167,
    50, 69, 161, 200
];

// Create Pubkey constants
pub const FEE_COLLECTOR: Pubkey = Pubkey::new_from_array(FEE_COLLECTOR_BYTES);
pub const MIGRATION_ADMIN: Pubkey = Pubkey::new_from_array(MIGRATION_ADMIN_BYTES); 

