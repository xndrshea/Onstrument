import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export enum curveType {
    Linear = 'linear',
    Exponential = 'exponential',
    Logarithmic = 'logarithmic'
}

export interface curveConfig {
    curveType: curveType;
    basePrice: BN;
    slope: BN;
    exponent: BN;
    logBase: BN;
}

export interface BondingCurveAccount {
    mint: PublicKey;
    config: curveConfig;
    bump: number;
}

export interface priceInfo {
    price: BN;
    supplyDelta: BN;
    isBuy: boolean;
}

export interface createTokenParams {
    name: string;
    symbol: string;
    initialSupply: BN;
    metadataUri: string;
    curveConfig: curveConfig;
}

export type Network = 'mainnet' | 'devnet';

export interface TokenRecord {
    id: number;
    mintAddress: string;
    curveAddress: string;
    name: string;
    symbol: string;
    description: string;
    metadataUri: string | null;
    totalSupply: BN;
    decimals: number;
    curveConfig: curveConfig;
    createdAt: Date;
}

export interface TokenFormData {
    name: string;
    symbol: string;
    description: string;
    image: File | null;
    supply: number;
    curveType: curveType;
    basePrice: number;
    slope: number;
    exponent: number;
    logBase: number;
}