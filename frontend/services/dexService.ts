import { TokenRecord } from '../../shared/types/token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Liquidity, Market, Token } from '@raydium-io/raydium-sdk';
import { connection } from '../config';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

interface TradeParams {
    mintAddress: string;
    amount: number;
    isSelling: boolean;
    slippageTolerance: number;
}

export class DexService {
    private connection: Connection;

    constructor() {
        this.connection = connection;
    }

    async getTopTokens(): Promise<TokenRecord[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens?type=dex`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching DEX tokens:', error);
            throw error;
        }
    }

    async getTokenPrice(mintAddress: string): Promise<number> {
        try {
            const response = await fetch(`${API_BASE_URL}/dex/price/${mintAddress}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.price;
        } catch (error) {
            console.error('Error fetching token price:', error);
            throw error;
        }
    }

    async executeTrade({ mintAddress, amount, isSelling, slippageTolerance }: TradeParams): Promise<string> {
        try {
            const response = await fetch(`${API_BASE_URL}/dex/pool/${mintAddress}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch pool info`);
            }
            const poolInfo = await response.json();

            const tx = await this.createTradeTransaction({
                poolAddress: new PublicKey(poolInfo.poolAddress),
                mintAddress: new PublicKey(mintAddress),
                amount,
                isSelling,
                slippageTolerance
            });

            await fetch(`${API_BASE_URL}/dex/trades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokenMintAddress: mintAddress,
                    price: poolInfo.price,
                    amount,
                    type: isSelling ? 'sell' : 'buy'
                })
            });

            return tx;
        } catch (error) {
            console.error('Trade execution error:', error);
            throw new Error(error instanceof Error ? error.message : 'Trade failed');
        }
    }

    private async createTradeTransaction({
        poolAddress,
        mintAddress,
        amount,
        isSelling,
        slippageTolerance
    }: any): Promise<string> {
        throw new Error('Trade execution not yet implemented');
    }
}

export const dexService = new DexService();