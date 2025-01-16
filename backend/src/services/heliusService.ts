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
    }
}; 