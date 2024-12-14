import { Connection, clusterApiUrl } from '@solana/web3.js';

// Environment-specific configurations
export const config = {
    HELIUS_RPC_URL: import.meta.env.VITE_HELIUS_RPC_URL,
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
};

// Network connections
export const DEVNET_URL = clusterApiUrl('devnet');
export const devnetConnection = new Connection(DEVNET_URL);

// Use Helius for all mainnet connections
export const mainnetConnection = new Connection(
    config.HELIUS_RPC_URL || DEVNET_URL, // Fallback to devnet if Helius URL not available
    'confirmed'
);

// Default connection for wallet adapter
export const defaultConnection = config.HELIUS_RPC_URL ? mainnetConnection : devnetConnection;

// Constants
export const BONDING_CURVE_PROGRAM_ID = 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw';
export const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE_URL = 'http://localhost:3001/api';