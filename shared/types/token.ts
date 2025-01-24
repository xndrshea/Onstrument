import type { PublicKey } from '@solana/web3.js';
import type BN from 'bn.js';


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
    name?: string;
    symbol?: string;
    decimals?: number;
    tokenType: 'custom' | 'dex';
    description?: string;
    websiteUrl?: string;
    docsUrl?: string;
    twitterUrl?: string;
    telegramUrl?: string;
    metadataUrl?: string;
    createdAt?: string;
    curveAddress?: string;
    curveConfig?: any;
    interface?: string;
    content?: any;
    authorities?: any;
    compression?: any;
    grouping?: any;
    royalty?: any;
    creators?: any;
    ownership?: any;
    supply?: any;
    mutable?: boolean;
    burnt?: boolean;
    tokenInfo?: any;
    verified?: boolean;
    imageUrl?: string;
    attributes?: any;
    priceSol?: number;
    offChainMetadata?: any;
    metadataStatus?: string;
    metadataSource?: string;
    metadataFetchAttempts?: number;
    lastMetadataFetch?: string;
    tokenVault?: string;
    marketCapUsd?: number;
    fullyDilutedValueUsd?: number;
    priceChange5m?: number;
    priceChange1h?: number;
    priceChange6h?: number;
    priceChange24h?: number;
    priceChange7d?: number;
    priceChange30d?: number;
    tokenSource?: 'custom' | 'raydium' | 'geckoterminal';
    lastPriceUpdate?: string;
    currentPrice?: number;
    volume5m?: number;
    volume1h?: number;
    volume6h?: number;
    volume24h?: number;
    volume7d?: number;
    volume30d?: number;
    apr24h?: number;
    apr7d?: number;
    apr30d?: number;
    tvl?: number;
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
    reserveInUsd?: number;
    baseTokenPriceNativeCurrency?: number;
    quoteTokenPriceNativeCurrency?: number;
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