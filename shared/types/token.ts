import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';


export interface curveConfig {
    migrationStatus: "active" | "migrated";
    isSubscribed: boolean;
    developer: string;
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
    decimals: number;
    description?: string;
    websiteUrl?: string;
    docsUrl?: string;
    twitterUrl?: string;
    telegramUrl?: string;
    metadataUri?: string;
    tokenType: 'pool' | 'custom';
    verified: boolean;
    imageUrl?: string;
    attributes?: Record<string, any>;
    content?: {
        metadata?: {
            image?: string;
            collection?: {
                name?: string;
            };
        };
    };
    curveAddress?: string;
    tokenVault?: string;
    curveConfig?: curveConfig;
    totalSupply?: number;
    currentPrice?: number;
    volume24h?: number;
    createdAt: string;
    metadataStatus?: string;
    interface?: string;
    initialPrice?: number;
    website?: string;
    twitter?: string;
    discord?: string;
    telegram?: string;
    marketCap?: number;
}

export interface TokenFormData {
    name: string;
    symbol: string;
    description: string;
    image?: string | null;
    websiteUrl?: string;
    docsUrl?: string;
    twitterUrl?: string;
    telegramUrl?: string;
    supply: number;
    totalSupply: BN;
    curveConfig: curveConfig;
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