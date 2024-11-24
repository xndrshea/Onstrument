import { PublicKey } from '@solana/web3.js';

export enum CurveType {
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
    LOGARITHMIC = 'logarithmic'
}

export interface CurveConfig {
    curveType: {
        linear?: {};
        exponential?: {};
        logarithmic?: {};
    };
    basePrice: number;
    slope?: number;
    exponent?: number;
    logBase?: number;
}

// On-chain token data
export interface OnChainTokenData {
    mint: PublicKey;
    curve: PublicKey;
    totalSupply: number;
    authority: PublicKey;
    config: CurveConfig;
}

// Base token data
export interface TokenBase {
    name: string;
    symbol: string;
    description?: string;
    total_supply: number;
    decimals: number;
    network: Network;
}

// Database token record
export interface TokenRecord extends TokenBase {
    id: number;
    mint_address: string;
    curve_address: string;
    creator_id: number | null;
    created_at: Date;
    metadata: Record<string, any>;
}

// Token statistics
export interface TokenStats {
    token_id: number;
    holder_count: number;
    transaction_count: number;
    last_price: number | null;
    market_cap: number | null;
    volume_24h: number | null;
    updated_at: Date;
}

// Trade history record
export interface TradeHistory {
    id: number;
    token_id: number;
    trader_address: string;
    transaction_signature: string;
    amount: number;
    price: number;
    is_buy: boolean;
    timestamp: Date;
}

// Combined token data (for API responses)
export interface TokenData extends TokenRecord {
    stats?: TokenStats;
    recent_trades?: TradeHistory[];
}

// Token creation parameters
export interface CreateTokenParams {
    mint_address: string;
    curve_address: string;
    name: string;
    symbol: string;
    description?: string;
    total_supply: number;
    creator_id?: number;
    network?: Network;
    metadata?: Record<string, any>;
}

export type Network = 'mainnet' | 'devnet';