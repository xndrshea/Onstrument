import { Connection } from '@solana/web3.js';

const isDocker = import.meta.env.VITE_DOCKER === 'true';

// Update your RPC endpoint configuration to include /api
const ENDPOINTS = {
    production: {
        base: isDocker ? 'http://backend:3001' : 'https://api.yourapp.com',
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

// Custom RPC request function
const createCustomRpcRequest = (endpoint: string) => {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const isDevnet = endpoint.includes('devnet');

        // Use the WebSocket endpoint for subscription methods
        if (body.method?.includes('subscribe')) {
            endpoint = `${ENV.base}${ENV.ws}`;
        }

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

// Use isDocker instead of isProduction
const ENV = isDocker ? ENDPOINTS.production : ENDPOINTS.development;

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
        wsEndpoint: `${ENV.base}${ENV.ws}`.replace('http', 'ws').replace('https', 'wss')
    }
);

export const defaultConnection = isDocker ? mainnetConnection : devnetConnection;

export const config = {
    isDocker
};