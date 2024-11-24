import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export enum CurveType {
    Linear = 'Linear',
    Exponential = 'Exponential',
    Logarithmic = 'Logarithmic'
}

export interface CurveConfig {
    curve_type: CurveType;
    base_price: BN;
    slope: BN | null;
    exponent: BN | null;
    log_base: BN | null;
}

export interface BondingCurveAccount {
    authority: PublicKey;
    mint: PublicKey;
    total_supply: BN;
    config: CurveConfig;
    bump: number;
}

export interface PriceQuote {
    spot_price: BN;
    total_price: BN;
    price_impact: number;
}

export interface TokenRecord {
    id: number;
    mint_address: string;
    curve_address: string;
    name: string;
    symbol: string;
    description?: string;
    total_supply: BN;
    decimals: number;
    curve_config: CurveConfig;
    created_at: Date;
}

export type Network = 'mainnet' | 'devnet';

export interface CreateTokenParams {
    mint_address?: string;
    curve_address?: string;
    name: string;
    symbol: string;
    description?: string;
    total_supply: BN;
    curve_type: CurveType;
    base_price: BN;
    slope?: BN;
    exponent?: BN;
    log_base?: BN;
}