import { TokenRecord } from '../../shared/types/token';
import { logger } from '../utils/logger';
import BN from 'bn.js';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_DECIMALS = 9;

export class TokenService {
    private transformToken(token: any): TokenRecord {
        const transformedToken = {
            mintAddress: token.mint_address || token.mintAddress,
            name: (token.name || '').trim(),
            symbol: (token.symbol || '').trim(),
            description: token.description || '',
            metadataUri: token.metadata_url || token.metadataUri,
            totalSupply: token.total_supply ? new BN(token.total_supply) : undefined,
            decimals: token.decimals || TOKEN_DECIMALS,
            curveAddress: token.curve_address || token.curveAddress,
            curveConfig: token.curve_config ? {
                virtualSol: new BN(token.curve_config.virtual_sol || 30)
            } : { virtualSol: new BN(0) },
            createdAt: token.created_at || token.createdAt || new Date().toISOString(),
            tokenType: token.tokenType || 'custom'
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
            let response;
            console.log('Fetching token details for:', mintAddress, 'type:', tokenType);

            // If tokenType is specified, try that endpoint first
            if (tokenType === 'custom') {
                response = await fetch(`${API_BASE_URL}/tokens/custom/${mintAddress}`);
            } else if (tokenType === 'pool') {
                response = await fetch(`${API_BASE_URL}/market/tokens/${mintAddress}`);
            } else {
                // If no type specified or unknown, try both endpoints
                response = await fetch(`${API_BASE_URL}/tokens/custom/${mintAddress}`);
                if (!response.ok) {
                    response = await fetch(`${API_BASE_URL}/market/tokens/${mintAddress}`);
                }
            }

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Ensure proper data transformation
            const transformedToken = {
                ...data,
                mintAddress: data.mintAddress || data.mint_address, // Handle both formats
                tokenType: tokenType || data.tokenType || 'pool',
                decimals: data.decimals || 9,
                description: data.description || '',
                totalSupply: data.totalSupply || data.total_supply || '0',
                name: data.name?.trim() || 'Unknown Token',
                symbol: data.symbol?.trim() || 'UNKNOWN'
            };

            console.log('Transformed token data:', transformedToken);

            // Validate required fields
            if (!transformedToken.mintAddress) {
                throw new Error(`Invalid token data: missing mintAddress for token ${transformedToken.name}`);
            }

            return transformedToken;
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