/// <reference types="vite/client" />

import { Connection } from '@solana/web3.js';

const isDocker = import.meta.env.VITE_DOCKER === 'true';
const isProd = import.meta.env.PROD === true;

// Debug log
console.log('Environment Variables:', {
    VITE_DOCKER: import.meta.env.VITE_DOCKER,
    PROD: import.meta.env.PROD,
    MODE: import.meta.env.MODE,
    selectedEndpoint: isDocker && isProd ? 'docker' :
        !isDocker && isProd ? 'production' :
            !isDocker ? 'development' : 'docker'
});

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

const ENV = getEnvironment();

// Custom RPC request function
const createCustomRpcRequest = (endpoint: string) => {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const isDevnet = endpoint.includes('devnet');

        const requestBody = {
            jsonrpc: '2.0',
            id: body.id || '1',
            method: body.method,
            params: Array.isArray(body.params) ? body.params : [],
            isDevnet
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.clone().json();
            return new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('RPC request failed:', error);
            throw error;
        }
    };
};

// Create connections with cleaner URL construction
export const mainnetConnection = new Connection(
    `${ENV.base}${ENV.mainnet}`,
    {
        commitment: 'confirmed',
        fetch: createCustomRpcRequest(`${ENV.base}${ENV.mainnet}`),
        wsEndpoint: `${ENV.base}${ENV.ws}`.replace('http', 'ws').replace('https', 'wss')
    }
);

export const devnetConnection = new Connection(
    `${ENV.base}${ENV.devnet}`,
    {
        commitment: 'confirmed',
        fetch: createCustomRpcRequest(`${ENV.base}${ENV.devnet}`),
        wsEndpoint: `${ENV.base.replace('http', 'ws').replace('https', 'wss')}${ENV.ws}`
    }
);

export const defaultConnection = isDocker ? mainnetConnection : devnetConnection;

export const config = {
    isDocker
};
