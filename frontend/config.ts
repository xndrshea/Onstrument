import { Connection } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

// Update your RPC endpoint configuration to include /api
const ENDPOINTS = {
    production: {
        base: 'https://api.yourapp.com',
        mainnet: '/api/helius/rpc',        // Added /api prefix
        devnet: '/api/helius/devnet/rpc',   // Added /api prefix
        ws: '/api/ws'  // Add WebSocket endpoint
    },
    development: {
        base: 'http://localhost:3001',
        mainnet: '/api/helius/rpc',        // Added /api prefix
        devnet: '/api/helius/devnet/rpc',   // Added /api prefix
        ws: '/api/ws'  // Add WebSocket endpoint
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

// Get the current environment's endpoints
const ENV = ENDPOINTS[isProduction ? 'production' : 'development'];

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

export const defaultConnection = isProduction ? mainnetConnection : devnetConnection;

export const config = {
    isProduction
};