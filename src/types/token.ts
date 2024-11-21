export interface TokenData {
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    image_url?: string;
    metadata?: {
        bondingCurveATA?: string;
        reserveAccount?: string;
        currentSupply?: number;
        createdAt?: string;
    };
    bondingCurveConfig?: {
        initialPrice: number;
        slope: number;
        reserveRatio: number;
    };
    createdAt?: string;
} 