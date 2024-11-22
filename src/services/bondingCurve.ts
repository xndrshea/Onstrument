import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export class BondingCurve {
    private static instance: BondingCurve | null = null;
    private static MINIMUM_RESERVE_SOL = 1; // 1 SOL minimum phantom reserve

    private constructor() { }

    static getInstance(): BondingCurve {
        if (!BondingCurve.instance) {
            BondingCurve.instance = new BondingCurve();
        }
        return BondingCurve.instance;
    }

    getEffectiveReserve(actualReserve: number): number {
        // Use 1 SOL minimum for price calculations
        return Math.max(actualReserve, BondingCurve.MINIMUM_RESERVE_SOL);
    }

    getPrice(currentSupply: number, actualReserve: number): number {
        if (currentSupply <= 0) return 0;
        const effectiveReserve = this.getEffectiveReserve(actualReserve);
        return effectiveReserve / currentSupply;
    }

    getCost(amount: number, currentSupply: number, actualReserve: number): number {
        if (amount <= 0) return 0;
        const effectiveReserve = this.getEffectiveReserve(actualReserve);
        return effectiveReserve * (amount / currentSupply);
    }

    getReturn(amount: number, currentSupply: number, actualReserve: number): number {
        if (amount <= 0 || currentSupply < amount) return 0;
        // For selling, we use actual reserve, not phantom
        return actualReserve * (amount / currentSupply);
    }
}