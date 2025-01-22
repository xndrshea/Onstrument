import type { TokenRecord } from '../../shared/types/token';
import { logger } from '../utils/logger';
import BN from 'bn.js';
import { TOKEN_DECIMALS } from './bondingCurve';
import type { WalletContextState } from '@solana/wallet-adapter-react';

const API_BASE_URL = '/api';

export class TokenService {
    constructor(private wallet?: WalletContextState) { }

    async transformToken(token: any): Promise<TokenRecord> {
        // Helper function to convert snake_case to camelCase
        const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

        // Helper function to safely convert string to number
        const toNumber = (value: any) => {
            if (value === null || value === undefined) return 0;
            const num = Number(value);
            return isNaN(num) ? 0 : num;
        };

        // Convert all snake_case keys to camelCase
        const transformed: any = {};
        Object.entries(token).forEach(([key, value]) => {
            // Special cases for compound words
            if (key === 'mint_address') {
                transformed.mintAddress = value;
            } else if (key.startsWith('volume_')) {
                // Handle volume metrics (volume_5m -> volume5m)
                const period = key.split('_')[1];
                transformed[`volume${period}`] = toNumber(value);
            } else if (key.startsWith('tx_')) {
                // Handle transaction metrics (tx_5m_buys -> tx5mBuys)
                const [_, period, type] = key.split('_');
                const transformedKey = `tx${period}${type.charAt(0).toUpperCase() + type.slice(1)}`;
                transformed[transformedKey] = toNumber(value);
            } else if (key.startsWith('price_change_')) {
                // Handle price changes (price_change_5m -> priceChange5m)
                const period = key.split('_')[2];
                transformed[`priceChange${period}`] = toNumber(value);
            } else {
                // Default camelCase conversion for other fields
                const camelKey = toCamelCase(key);
                transformed[camelKey] = key.includes('price') || key.includes('volume') ||
                    key.includes('cap') || key.includes('tvl') ? toNumber(value) : value;
            }
        });

        return transformed;
    }

    async create(token: TokenRecord): Promise<TokenRecord> {
        try {
            const requestData = {
                mintAddress: token.mintAddress,
                curveAddress: token.curveAddress,
                name: token.name,
                symbol: token.symbol,
                description: token.description || '',
                metadataUri: token.metadataUri || '',
                totalSupply: token.totalSupply?.toString() || '0',
                decimals: token.decimals,
                curveConfig: token.curveConfig,
                initialPrice: token.initialPrice,
                websiteUrl: token.websiteUrl || '',
                twitterUrl: token.twitterUrl || '',
                docsUrl: token.docsUrl || '',
                telegramUrl: token.telegramUrl || '',
                tokenVault: token.tokenVault
            };


            const response = await fetch(`${API_BASE_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
            }

            const data = JSON.parse(responseText);

            return {
                ...token,
                ...data,
                tokenType: 'custom' as const
            };
        } catch (error) {
            console.error('Token service create error:', {
                error,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    async getAllTokens(page = 1, limit = 50): Promise<{ tokens: TokenRecord[], pagination: any }> {
        const url = `${API_BASE_URL}/market/tokens?page=${page}&limit=${limit}`;


        try {
            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again later.');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return {
                tokens: data.tokens.map(this.transformToken),
                pagination: data.pagination
            };
        } catch (error) {
            console.error('Error fetching tokens:', error);
            throw error;
        }
    }

    async getByMintAddress(mintAddress: string, tokenType?: string): Promise<TokenRecord | null> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens/${mintAddress}${tokenType ? `?type=${tokenType}` : ''}`);

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return this.transformToken(data);
        } catch (error) {
            console.error('Error fetching token:', error);
            throw error;
        }
    }

    async updateStats(mintAddress: string, stats: Partial<TokenRecord>): Promise<void> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens/${mintAddress}/stats`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(stats),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            logger.error('Error updating token stats:', error);
            throw error;
        }
    }
}

export const tokenService = new TokenService();