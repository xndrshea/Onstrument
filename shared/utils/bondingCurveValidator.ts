import { TokenBondingCurveConfig, CurveType } from '../types/token';

export class BondingCurveValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BondingCurveValidationError';
    }
}

export function validateBondingCurveConfig(config: TokenBondingCurveConfig): void {
    if (!config.curveType || !config.basePrice) {
        throw new BondingCurveValidationError('Missing required bonding curve parameters');
    }

    if (config.basePrice <= 0) {
        throw new BondingCurveValidationError('Base price must be greater than 0');
    }

    switch (config.curveType) {
        case CurveType.LINEAR:
            if (typeof config.slope !== 'number') {
                throw new BondingCurveValidationError('Linear curve requires slope parameter');
            }
            if (config.slope <= 0) {
                throw new BondingCurveValidationError('Slope must be greater than 0');
            }
            break;

        case CurveType.EXPONENTIAL:
            if (typeof config.exponent !== 'number') {
                throw new BondingCurveValidationError('Exponential curve requires exponent parameter');
            }
            if (config.exponent <= 0) {
                throw new BondingCurveValidationError('Exponent must be greater than 0');
            }
            break;

        case CurveType.LOGARITHMIC:
            if (typeof config.logBase !== 'number') {
                throw new BondingCurveValidationError('Logarithmic curve requires logBase parameter');
            }
            if (config.logBase <= 1) {
                throw new BondingCurveValidationError('Log base must be greater than 1');
            }
            break;

        default:
            throw new BondingCurveValidationError('Invalid curve type');
    }
}