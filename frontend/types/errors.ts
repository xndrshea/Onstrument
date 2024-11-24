export enum BondingCurveError {
    InvalidCurveConfig = 'Invalid curve configuration',
    InvalidAmount = 'Invalid amount',
    SlippageExceeded = 'Slippage tolerance exceeded',
    MathOverflow = 'Math overflow',
    InsufficientBalance = 'Insufficient balance',
    InsufficientLiquidity = 'Insufficient liquidity',
}

export function getProgramErrorMessage(error: any): string {
    const errorCode = error?.error?.errorCode?.number;
    if (!errorCode) return error.message || 'Unknown error occurred';

    switch (errorCode) {
        case 6000:
            return BondingCurveError.InvalidCurveConfig;
        case 6001:
            return BondingCurveError.InvalidAmount;
        case 6002:
            return BondingCurveError.SlippageExceeded;
        case 6003:
            return BondingCurveError.MathOverflow;
        case 6004:
            return BondingCurveError.InsufficientBalance;
        case 6005:
            return BondingCurveError.InsufficientLiquidity;
        default:
            return error.message || 'Unknown error occurred';
    }
}
