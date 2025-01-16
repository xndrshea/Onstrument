import { Connection, clusterApiUrl } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

// Base URLs
export const API_URL = isProduction
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:3001';

// Network connections
export const mainnetConnection = new Connection('/api/helius/rpc');
export const devnetConnection = new Connection('/api/helius/devnet/rpc');
export const defaultConnection = isProduction ? mainnetConnection : devnetConnection;

export const config = {
    isProduction
};