import { Connection } from '@solana/web3.js';

const isProduction = import.meta.env.MODE === 'production';

// Base URLs - hardcoded for security
const API_URL = isProduction
    ? 'https://api.yourapp.com'   // Replace with your production API URL
    : 'http://localhost:3001';    // Local development API URL

// Custom RPC request function
const createCustomRpcRequest = (endpoint: string) => {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const body = init?.body ? JSON.parse(init.body as string) : {};

        const rpcRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: body.method,
            params: body.params || []
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rpcRequest)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }

        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
    };
};

// Create connections with custom RPC handlers
export const mainnetConnection = new Connection(
    `${API_URL}/api/helius/rpc`,
    {
        commitment: 'confirmed',
        fetch: createCustomRpcRequest(`${API_URL}/api/helius/rpc`)
    }
);

export const devnetConnection = new Connection(
    `${API_URL}/api/helius/devnet/rpc`,
    {
        commitment: 'confirmed',
        fetch: createCustomRpcRequest(`${API_URL}/api/helius/devnet/rpc`)
    }
);

export const defaultConnection = isProduction ? mainnetConnection : devnetConnection;

export const config = {
    isProduction
};