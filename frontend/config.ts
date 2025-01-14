import { Connection, clusterApiUrl } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

// Environment-specific configurations
export const API_URL = isProduction
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:3001';

export const API_BASE_URL = `${API_URL}/api`;
export const MAINNET_API_BASE_URL = `${API_URL}/api`;

// Use Helius for all mainnet connections with commitment
export const mainnetConnection = new Connection(
    import.meta.env.VITE_HELIUS_RPC_URL || 'https://rpc.helius.xyz/?api-key=YOUR_API_KEY',
    { commitment: 'confirmed' }
);

// Network connections
export const DEVNET_URL = clusterApiUrl('devnet');
export const devnetConnection = new Connection(DEVNET_URL);

// Default connection based on environment
export const defaultConnection = isProduction ? mainnetConnection : devnetConnection;

// Constants
export const BONDING_CURVE_PROGRAM_ID = 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw';

// Add config object export
export const config = {
    HELIUS_RPC_URL: import.meta.env.VITE_HELIUS_RPC_URL,
    API_BASE_URL: API_URL,
    BONDING_CURVE_PROGRAM_ID: 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw',
    isProduction
};