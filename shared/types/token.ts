import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';


export interface curveConfig {
    virtualSol: BN;
}

export interface BondingCurveAccount {
    mint: PublicKey;
    config: curveConfig;
    bump: number;
}

export interface priceInfo {
    spotPrice: BN;
}

export interface createTokenParams {
    name: string;
    symbol: string;
    totalSupply: BN;
    metadataUri: string;
    curveConfig: curveConfig;
}

export type Network = 'mainnet' | 'devnet';

export interface TokenRecord {
    mintAddress: string;
    name: string;
    symbol: string;
    tokenType: 'custom' | 'dex';
    description?: string;
    metadataUri?: string;
    totalSupply?: BN;
    decimals: number;
    curveAddress?: string;
    curveConfig?: curveConfig;
    poolAddress?: string;
    volume24h?: number;
    liquidity?: number;
    createdAt?: string;
}

export interface TokenFormData {
    name: string;
    symbol: string;
    description: string;
    image: File | null;
    supply: number;
    virtualSol: number;
}

export interface DexToken {
    mintAddress: string;
    name: string;
    symbol: string;
    poolAddress: string;
    decimals?: number;
    price: number;
    volume24h: number;
    liquidity: number;
    priceChange24h: number;
    totalSupply?: number;
}