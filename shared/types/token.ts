import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export enum CurveType {
    Linear = 0,
    Exponential = 1,
    Logarithmic = 2
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
    price_impact: BN;
}

export interface TokenRecord {
    id: number;
    mint_address: string;
    curve_address: string;
    name: string;
    symbol: string;
    description: string;
    metadata_uri: string | null;
    total_supply: BN;
    decimals: number;
    curve_config: CurveConfig;
    created_at: Date;
}

export type Network = 'mainnet' | 'devnet';

export interface CreateTokenParams {
    name: string;
    symbol: string;
    initial_supply: BN;
    metadata_uri: string;
    curve_config: CurveConfig;
}

export interface TokenFormData {
    name: string;
    symbol: string;
    description: string;
    image: File | null;
    supply: number;
    curveType: CurveType;
    basePrice: number;
    slope: number;
    exponent: number;
    logBase: number;
}