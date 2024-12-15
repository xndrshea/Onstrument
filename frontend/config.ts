import { Connection, clusterApiUrl } from '@solana/web3.js';

// Environment-specific configurations
export const config = {
    HELIUS_RPC_URL: import.meta.env.VITE_HELIUS_RPC_URL,
    API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001'
};

// Use Helius for all mainnet connections with commitment
export const mainnetConnection = new Connection(
    config.HELIUS_RPC_URL || 'https://rpc.helius.xyz/?api-key=97d79e58-2187-4575-96b1-4c8a6cc2f66c',
    { commitment: 'confirmed' }
);

// Network connections
export const DEVNET_URL = clusterApiUrl('devnet');
export const devnetConnection = new Connection(DEVNET_URL);

// Default connection for wallet adapter
export const defaultConnection = config.HELIUS_RPC_URL ? mainnetConnection : devnetConnection;

// Constants
export const BONDING_CURVE_PROGRAM_ID = 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE_URL = 'http://localhost:3001/api';