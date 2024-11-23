import { PublicKey } from '@solana/web3.js';

export enum CurveType {
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
    LOGARITHMIC = 'logarithmic'
}

export interface TokenMetadata {
    bondingCurveATA: string;
    bondingCurveAddress: string;
    creator_id?: number;
    network?: 'mainnet' | 'devnet';
    image_url?: string;
    totalSupply?: number;
}

export interface TokenBondingCurveConfig {
    curveType: CurveType;
    basePrice: number;
    slope?: number;
    exponent?: number;
    logBase?: number;
}

export interface Token {
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    creator?: string;
    total_supply: number;
    metadata: TokenMetadata;
    bonding_curve_config: TokenBondingCurveConfig;
    created_at?: string;
}