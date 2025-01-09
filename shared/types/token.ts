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
    tokenType: string;
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
    marketCapUsd?: number;
    volume?: number;
    tvl?: number;
    volume5m?: number;
    volume1h?: number;
    volume6h?: number;
    volume7d?: number;
    volume30d?: number;
    tx5mBuys?: number;
    tx5mSells?: number;
    tx5mBuyers?: number;
    tx5mSellers?: number;
    tx1hBuys?: number;
    tx1hSells?: number;
    tx1hBuyers?: number;
    tx1hSellers?: number;
    tx6hBuys?: number;
    tx6hSells?: number;
    tx6hBuyers?: number;
    tx6hSellers?: number;
    tx24hBuys?: number;
    tx24hSells?: number;
    tx24hBuyers?: number;
    tx24hSellers?: number;
    priceChange5m?: number;
    priceChange1h?: number;
    priceChange6h?: number;
    priceChange24h?: number;
    priceChange7d?: number;
    priceChange30d?: number;
    apr24h?: number;
    apr7d?: number;
    apr30d?: number;
    tokenSource?: string;
    supply?: number;
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