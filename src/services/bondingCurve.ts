import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

export interface BondingCurveConfig {
    initialPrice: number;
    slope: number;
    initialSupply: number;
    maxSupply: number;
    reserveRatio: number;
}

export const DEFAULT_BONDING_CURVE_CONFIG: BondingCurveConfig = {
    initialPrice: 0.001, // 0.001 SOL
    slope: 0.00001,
    initialSupply: 1000000,
    maxSupply: 1000000000,
    reserveRatio: 0.5
}

export class BondingCurve {
    private config: BondingCurveConfig;

    constructor(config: Partial<BondingCurveConfig>) {
        this.config = {
            ...DEFAULT_BONDING_CURVE_CONFIG,
            ...config
        };
    }

    getCurrentPrice(currentSupply: number): number {
        return this.config.initialPrice + (this.config.slope * currentSupply);
    }

    getCost(amount: number): number {
        const currentSupply = this.config.initialSupply;
        const finalSupply = currentSupply + amount;

        // Using the integral of the price function (linear)
        const area = (this.config.initialPrice * amount) +
            (this.config.slope * amount * (2 * currentSupply + amount)) / 2;

        return area;
    }

    getReturn(amount: number): number {
        const currentSupply = this.config.initialSupply;
        if (amount > currentSupply) {
            throw new Error('Cannot sell more tokens than current supply');
        }

        const finalSupply = currentSupply - amount;

        // Using the integral of the price function (linear)
        const area = (this.config.initialPrice * amount) +
            (this.config.slope * amount * (2 * currentSupply - amount)) / 2;

        return area;
    }
} 