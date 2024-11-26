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
    slope: BN;
    exponent: BN;
    log_base: BN;
}

export interface BondingCurveAccount {
    mint: PublicKey;
    config: CurveConfig;
    bump: number;
}

export interface PriceInfo {
    price: BN;
    supply_delta: BN;
    is_buy: boolean;
}

export interface CreateTokenParams {
    name: string;
    symbol: string;
    initial_supply: BN;
    metadata_uri: string;
    curve_config: {
        curve_type: CurveType;
        base_price: BN;
        slope: BN;
        exponent: BN;
        log_base: BN;
    };
}

export interface BuyParams {
    amount: BN;
    max_sol_cost: BN;
}

export interface SellParams {
    amount: BN;
    min_sol_return: BN;
}

export type Network = 'mainnet' | 'devnet';

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