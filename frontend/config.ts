import { Connection, clusterApiUrl } from '@solana/web3.js';

// Existing API config
export const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

// New Solana devnet config
export const CLUSTER = 'devnet';
export const CLUSTER_URL = clusterApiUrl('devnet');
export const connection = new Connection(CLUSTER_URL);

// If you need to reference the program ID in multiple places
export const BONDING_CURVE_PROGRAM_ID = 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw';

export const API_BASE_URL = 'http://localhost:3001/api';

export const config = {
    HELIUS_RPC_URL: import.meta.env.VITE_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
};

// Separate connections for different networks
export const DEVNET_URL = clusterApiUrl('devnet');
export const devnetConnection = new Connection(DEVNET_URL);
export const mainnetConnection = new Connection(
    config.HELIUS_RPC_URL.startsWith('http')
        ? config.HELIUS_RPC_URL
        : 'https://api.mainnet-beta.solana.com'
);