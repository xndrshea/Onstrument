import { BN } from '@project-serum/anchor';
import { API_BASE_URL } from '../config';

interface TradeParams {
    mintAddress: string;
    amount: BN;
    isSelling: boolean;
    slippageTolerance: number;
}

export const dexService = {
    async executeTrade(params: TradeParams) {
        const response = await fetch(`${API_BASE_URL}/dex/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) throw new Error('Trade execution failed');
        return response.json();
    },

    getPoolInfo: async (mintAddress: string) => {
        const response = await fetch(`${API_BASE_URL}/dex/pool/${mintAddress}`);
        if (!response.ok) throw new Error('Failed to fetch pool info');
        return response.json();
    }
};