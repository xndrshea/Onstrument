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
    token_type: 'bonding_curve' | 'dex';
    liquidity?: number;
}

export interface TokenFormData {
    name: string;
    symbol: string;
    description: string;
    image: File | null;
    supply: number;
    virtualSol: number;
}