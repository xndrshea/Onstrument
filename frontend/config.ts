/// <reference types="vite/client" />

import { Connection } from '@solana/web3.js';

const isDocker = import.meta.env.VITE_DOCKER === 'true';
const isProd = import.meta.env.PROD === true;


const ENDPOINTS = {
    production: {
        base: 'https://api.onstrument.com',
        mainnet: '/api/helius/rpc',
        devnet: '/api/helius/devnet/rpc',
        ws: '/api/ws'
    },
    docker: {
        base: 'http://localhost:3001',
        mainnet: '/api/helius/rpc',
        devnet: '/api/helius/devnet/rpc',
        ws: '/api/ws'
    },
    development: {
        base: 'http://localhost:3001',
        mainnet: '/api/helius/rpc',
        devnet: '/api/helius/devnet/rpc',
        ws: '/api/ws'
    }
} as const;

export const getEnvironment = () => {
    if (isDocker && isProd) return ENDPOINTS.docker;     // Docker production build
    if (!isDocker && isProd) return ENDPOINTS.production; // Regular production
    if (!isDocker) return ENDPOINTS.development;         // Local development
    return ENDPOINTS.docker;                             // Docker development (fallback)
};

// Remove the direct endpoints and update the connection functions
export const getConnection = (isDevnet: boolean = false) => {
    const env = getEnvironment();
    const endpoint = isDevnet
        ? `${env.base}${env.devnet}`
        : `${env.base}${env.mainnet}`;

    return new Connection(endpoint, {
        commitment: 'confirmed',
        wsEndpoint: `${env.base}${env.ws}`,
        confirmTransactionInitialTimeout: 60000
    });
};

// Helper to determine connection type based on token
export const getConnectionForToken = (token?: { tokenType: string }) => {
    const isDevnet = token?.tokenType === 'custom';
    return getConnection(isDevnet);
};

export const getBaseUrl = () => {
    const env = getEnvironment();
    return env.base;
};

export const config = {
    isDocker
};
