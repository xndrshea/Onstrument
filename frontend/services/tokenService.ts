import { TokenRecord } from '../../shared/types/token';
import { logger } from '../utils/logger';
import BN from 'bn.js';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

export class TokenService {
    private transformToken(token: any): TokenRecord {
        return {
            mintAddress: token.mint_address,
            name: token.name,
            symbol: token.symbol,
            tokenType: token.token_type,
            description: token.description || '',
            metadataUri: token.metadata_uri,
            totalSupply: token.total_supply ? new BN(token.total_supply) : undefined,
            decimals: token.token_type === 'dex' ? token.dex_decimals : token.decimals,
            curveAddress: token.curve_address,
            curveConfig: token.curve_config ? {
                virtualSol: new BN(token.curve_config.virtual_sol)
            } : undefined,
            poolAddress: token.pool_address,
            volume24h: token.volume_24h || 0,
            liquidity: token.liquidity || 0,
            createdAt: token.created_at || new Date().toISOString(),
        };
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
                curveConfig: token.curveConfig
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
        try {
            const response = await fetch(`${API_BASE_URL}/tokens?page=${page}&limit=${limit}`, {
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

    async getByMintAddress(mintAddress: string): Promise<TokenRecord | null> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens/${mintAddress}`);
            if (response.status === 404) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            logger.error('Error fetching token:', error);
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