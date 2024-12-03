export enum BondingCurveError {
    InvalidCurveConfig = 'Invalid curve configuration',
    InvalidAmount = 'Invalid amount',
    SlippageExceeded = 'Slippage tolerance exceeded',
    MathOverflow = 'Math overflow',
    InsufficientBalance = 'Insufficient balance',
    InsufficientLiquidity = 'Insufficient liquidity',
}

export function getProgramErrorMessage(error: any): string {
    // Check for BN assertion errors first
    if (error?.message?.includes('Assertion failed')) {
        return 'Invalid number format - please check your input amount';
    }

    const errorCode = error?.error?.errorCode?.number;
    if (!errorCode) return error.message || 'Unknown error occurred';

    switch (errorCode) {
        case 6000: return "Slippage tolerance exceeded";
        case 6001: return "Insufficient liquidity in pool";
        case 6002: return "Math operation overflow - try a smaller amount";
        case 6003: return "Price exceeds maximum cost";
        case 6004: return "Price below minimum return";
        case 6005: return "Balance mismatch";
        case 6006: return "Invalid curve configuration";
        case 6007: return "Invalid amount";
        case 6008: return "Invalid token decimals";
        default: return error.message || 'Unknown error occurred';
    }
}
