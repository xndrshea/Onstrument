import { TokenRecord } from '../../shared/types/token';
import { logger } from '../utils/logger';
import BN from 'bn.js';
import { TOKEN_DECIMALS } from './bondingCurve';
import { WalletContextState } from '@solana/wallet-adapter-react';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

export class TokenService {
    constructor(private wallet?: WalletContextState) { }

    async transformToken(token: any): Promise<TokenRecord> {


        const transformedToken = {
            mintAddress: token.mint_address || token.mintAddress,
            name: (token.name || '').trim(),
            symbol: (token.symbol || '').trim(),
            description: token.description || '',
            metadataUri: token.metadata_url || token.metadataUri,
            totalSupply: token.supply || undefined,
            decimals: token.decimals || TOKEN_DECIMALS,
            curveAddress: token.curve_address || token.curveAddress,
            tokenVault: token.token_vault || token.tokenVault,
            curveConfig: token.curve_config ? {
                migrationStatus: token.curve_config.migration_status || "Active",
                isSubscribed: token.curve_config.is_subscribed,
                developer: token.curve_config.developer || ''
            } : undefined,
            createdAt: token.created_at || token.createdAt || new Date().toISOString(),
            tokenType: token.token_type || token.tokenType || 'custom',
            verified: token.verified || false,
            imageUrl: token.image_url || token.imageUrl,
            content: token.content,
            attributes: token.attributes,
            currentPrice: token.current_price || token.currentPrice,
            volume24h: token.volume_24h || token.volume24h,
            interface: token.interface,
            metadataStatus: token.metadata_status
        };

        return transformedToken;
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
                decimals: token.decimals || 6,
                curveConfig: token.curveConfig,
                initialPrice: token.initialPrice,
                websiteUrl: token.websiteUrl || '',
                twitterUrl: token.twitterUrl || '',
                docsUrl: token.docsUrl || '',
                telegramUrl: token.telegramUrl || '',
                tokenVault: token.tokenVault
            };

            console.log('Sending token creation request:', requestData);

            const response = await fetch(`${API_BASE_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`);
            }

            const data = await response.json();
            return {
                ...token,
                ...data,
                token_type: 'custom' as const
            };
        } catch (error) {
            console.error('Token creation error:', error);
            throw error;
        }
    }

    async getAllTokens(page = 1, limit = 50): Promise<{ tokens: TokenRecord[], pagination: any }> {
        const url = `${API_BASE_URL}/market/tokens?page=${page}&limit=${limit}`;
        console.log('Attempting to fetch from:', url);
        console.log('API_BASE_URL:', API_BASE_URL);

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