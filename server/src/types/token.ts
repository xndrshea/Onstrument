interface TokenBondingCurveConfig {
    curveType: 'linear' | 'exponential' | 'logarithmic';
    basePrice: number;
    slope?: number;
    exponent?: number;
    logBase?: number;
}

export interface Token {
    id?: number;
    mint_address: string;
    name: string;
    symbol: string;
    description: string;
    metadata: Record<string, any>;
    bonding_curve_config: TokenBondingCurveConfig;
    // ... other fields
} 