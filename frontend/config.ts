import { Connection, clusterApiUrl } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

export const API_URL = isProduction
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:3001';

export const API_BASE_URL = `${API_URL}/api`;
export const MAINNET_API_BASE_URL = API_BASE_URL;

// Network connections
export const DEVNET_URL = clusterApiUrl('devnet');
export const devnetConnection = new Connection(DEVNET_URL);
export const defaultConnection = devnetConnection;

export const config = {
    API_BASE_URL,
    isProduction
};