import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TokenData } from './tokenService';

export enum CurveType {
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
    LOGARITHMIC = 'logarithmic'
}

interface BondingCurveConfig {
    curveType: CurveType;
    basePrice: number;
    slope?: number;        // For linear curve
    exponent?: number;     // For exponential curve
    logBase?: number;      // For logarithmic curve
    totalSupply: number;
}

interface PriceCalculationParams {
    currentSupply: number;    // Current circulating supply
    solReserves: number;      // Current SOL reserves
    amount: number;           // Amount being traded
    isSelling?: boolean;      // Trade direction
}

interface PriceCalculationResult {
    spotPrice: number;
    totalCost: number;
    priceImpact: number;
}

export class BondingCurve {
    private config: BondingCurveConfig;

    constructor(config: BondingCurveConfig) {
        console.log('Initializing bonding curve with config:', config);

        // Validate required fields
        if (!config.curveType) {
            throw new Error('Curve type is required');
        }

        if (typeof config.basePrice !== 'number' || config.basePrice <= 0) {
            throw new Error('Base price must be a positive number');
        }

        // Set defaults for optional parameters based on curve type
        switch (config.curveType) {
            case CurveType.LINEAR:
                if (typeof config.slope !== 'number') {
                    config.slope = 0.0000001; // Much smaller default slope
                }
                break;

            case CurveType.EXPONENTIAL:
                if (typeof config.exponent !== 'number') {
                    config.exponent = 2; // Default exponent
                }
                break;

            case CurveType.LOGARITHMIC:
                if (typeof config.logBase !== 'number') {
                    config.logBase = Math.E; // Default to natural log
                }
                break;
        }

        this.config = config;
    }

    calculatePrice({ currentSupply, solReserves, amount, isSelling = false }: PriceCalculationParams): PriceCalculationResult {
        try {
            // Normalize inputs with safety bounds
            currentSupply = Math.max(0, Math.min(currentSupply, this.config.totalSupply || 1e9));
            // Use amount = 1 as default for spot price calculation when amount is 0/undefined
            const calculationAmount = (!amount || amount <= 0) ? 1 : amount;
            solReserves = Math.max(0, Math.min(solReserves, 1e9));

            // Calculate base price from curve with error handling
            const basePriceAtCurrentSupply = this.calculateBaseCurvePrice(currentSupply);
            if (!isFinite(basePriceAtCurrentSupply)) {
                console.error('Invalid base price calculation result');
                return {
                    spotPrice: this.config.basePrice,
                    totalCost: !amount || amount <= 0 ? 0 : this.config.basePrice * amount,
                    priceImpact: 0
                };
            }

            // Calculate reserve multiplier with safety bounds
            const reserveRatio = currentSupply > 0 ? solReserves / currentSupply : 0;
            const reserveMultiplier = currentSupply > 0 ?
                Math.min(1 + Math.log(1 + Math.min(reserveRatio, 1e6)), 10) : 1;

            const spotPrice = Math.min(basePriceAtCurrentSupply * reserveMultiplier, 1e9);

            // Calculate total cost and price impact
            const direction = isSelling ? -1 : 1;
            const totalCost = !amount || amount <= 0 ? 0 :
                Math.min(calculationAmount * spotPrice * direction, 1e9);
            const priceImpact = calculationAmount / (this.config.totalSupply || 1e9);

            return {
                spotPrice: Math.max(spotPrice, this.config.basePrice),
                totalCost: !amount || amount <= 0 ? 0 : Math.abs(totalCost),
                priceImpact: Math.min(priceImpact, 1)
            };
        } catch (error) {
            console.error('Error in price calculation:', error);
            return {
                spotPrice: this.config.basePrice,
                totalCost: !amount || amount <= 0 ? 0 : this.config.basePrice * amount,
                priceImpact: 0
            };
        }
    }

    private calculateBaseCurvePrice(currentSupply: number): number {
        if (currentSupply === 0) {
            return this.config.basePrice;
        }

        // Add safety check for totalSupply
        if (!this.config.totalSupply || this.config.totalSupply <= 0) {
            return this.config.basePrice;
        }

        // Ensure currentSupply doesn't exceed totalSupply
        currentSupply = Math.min(currentSupply, this.config.totalSupply);

        const remainingSupplyPercentage = (this.config.totalSupply - currentSupply) / this.config.totalSupply;

        try {
            switch (this.config.curveType) {
                case CurveType.LINEAR:
                    if (!this.config.slope) throw new Error('Slope required for linear curve');
                    return this.config.basePrice * (1 + (this.config.slope * remainingSupplyPercentage));

                case CurveType.EXPONENTIAL:
                    if (!this.config.exponent) throw new Error('Exponent required for exponential curve');
                    // Add safety bounds for exponential calculation
                    const base = Math.min(1 + remainingSupplyPercentage, 100); // Prevent excessive growth
                    const exponent = Math.min(this.config.exponent, 10); // Limit maximum exponent
                    return this.config.basePrice * Math.pow(base, exponent);

                case CurveType.LOGARITHMIC:
                    if (!this.config.logBase) throw new Error('Log base required for logarithmic curve');
                    return this.config.basePrice * (1 + Math.log(1 + remainingSupplyPercentage) / Math.log(this.config.logBase));

                default:
                    throw new Error('Invalid curve type');
            }
        } catch (error) {
            console.error('Error in price calculation:', error);
            return this.config.basePrice; // Fallback to base price on error
        }
    }

    // Helper method to get price at different supply levels (useful for UI visualization)
    getPricePoints(maxSupply: number, points: number = 10): Array<{ supply: number; price: number }> {
        const result = [];
        for (let i = 0; i <= points; i++) {
            const supply = (maxSupply * i) / points;
            const price = this.calculateBaseCurvePrice(supply);
            result.push({ supply, price });
        }
        return result;
    }

    static fromToken(token: TokenData): BondingCurve {
        if (!token.bonding_curve_config) {
            throw new Error('Token missing bonding curve configuration');
        }

        return new BondingCurve({
            curveType: token.bonding_curve_config.curveType as CurveType,
            basePrice: token.bonding_curve_config.basePrice,
            slope: token.bonding_curve_config.slope,
            exponent: token.bonding_curve_config.exponent,
            logBase: token.bonding_curve_config.logBase,
            totalSupply: token.metadata.totalSupply || 0
        });
    }

    calculateSpotPrice(token: TokenData): number {
        return this.calculatePrice({
            currentSupply: token.metadata.currentSupply / 1e9,
            solReserves: token.metadata.solReserves,
            amount: 1,
            isSelling: false
        }).spotPrice;
    }

    calculateMarketCap(token: TokenData): number {
        const spotPrice = this.calculateSpotPrice(token);
        return spotPrice * (token.metadata.totalSupply / 1e9);
    }

    // Add a method to get current spot price without a trade
    getCurrentPrice(currentSupply: number, solReserves: number): number {
        return this.calculatePrice({
            currentSupply,
            solReserves,
            amount: 1,
            isSelling: false
        }).spotPrice;
    }
}