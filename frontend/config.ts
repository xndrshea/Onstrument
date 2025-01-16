import { Connection, clusterApiUrl } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

// Constants
const API_ENDPOINTS = {
    MAINNET_RPC: '/api/helius/rpc',
    DEVNET_RPC: '/api/helius/devnet/rpc'
} as const;

// Validate production URL
const validateApiUrl = (url: string | undefined): string => {
    if (!url && isProduction) {
        throw new Error('Production API URL is required');
    }
    return url || 'http://localhost:3001';
};

// Base URLs
export const API_URL = validateApiUrl(import.meta.env.VITE_API_URL);

// Network connections
export const mainnetConnection = new Connection(
    `${API_URL}${API_ENDPOINTS.MAINNET_RPC}`,
    'confirmed'
);

export const devnetConnection = new Connection(
    `${API_URL}${API_ENDPOINTS.DEVNET_RPC}`,
    'confirmed'
);

export const defaultConnection = isProduction ? mainnetConnection : devnetConnection;

export const config = {
    isProduction
};