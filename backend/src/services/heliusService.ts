import { config } from '../config/env';
import axios from 'axios';

export const heliusService = {
    async getAssetsByOwner(walletAddress: string, isDevnet: boolean) {
        const heliusUrl = isDevnet ? config.HELIUS_DEVNET_RPC_URL : config.HELIUS_RPC_URL;

        const response = await axios.post(heliusUrl, {
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getAssetsByOwner',
            params: {
                ownerAddress: walletAddress,
                page: 1,
                limit: 1000,
                displayOptions: {
                    showFungible: true,
                },
            },
        });

        return response.data;
    },

    async makeRpcRequest(body: any) {
        const heliusUrl = body.isDevnet ? config.HELIUS_DEVNET_RPC_URL : config.HELIUS_RPC_URL;

        const { ...requestBody } = body;
        const response = await axios.post(heliusUrl, requestBody);
        return response.data;
    }
};

export const makeRpcRequest = async (body: any) => {
    const isDevnet = body.isDevnet;
    const endpoint = isDevnet ?
        `https://rpc-devnet.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}` :
        `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id || 'backend',
            method: body.method,
            params: body.params
        })
    });

    if (!response.ok) {
        throw new Error(`Helius RPC error: ${response.status}`);
    }

    return await response.json();
}; 