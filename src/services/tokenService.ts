import axios, { AxiosInstance } from 'axios'
import { Token, TokenMetadata, TokenBondingCurveConfig } from '../../shared/types/token';

export interface TokenData extends Token { }

export interface TokenCreationData {
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    creator?: string;
    total_supply: number;
    network?: string;
    metadata: TokenMetadata;
    bondingCurveConfig: TokenBondingCurveConfig;
}

export class TokenService {
    private api: AxiosInstance;

    constructor(baseURL: string) {
        this.api = axios.create({
            baseURL,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async create(token: TokenCreationData) {
        try {
            if (!token.mint_address) {
                throw new Error('Missing mint address');
            }
            if (!token.name || !token.symbol) {
                throw new Error('Missing required token information');
            }
            if (!token.metadata?.bondingCurveATA) {
                throw new Error('Missing bonding curve ATA');
            }
            if (!token.bondingCurveConfig) {
                throw new Error('Missing bonding curve configuration');
            }

            const payload = {
                mint_address: token.mint_address,
                name: token.name,
                symbol: token.symbol,
                description: token.description,
                creator: token.creator,
                total_supply: token.total_supply,
                network: token.network,
                metadata: token.metadata,
                bondingCurveConfig: token.bondingCurveConfig
            };

            console.log('Creating token with payload:', JSON.stringify(payload, null, 2));

            const response = await this.api.post('/api/tokens', payload);
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Token creation failed:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });
                throw new Error(error.response?.data?.message || error.message);
            }
            console.error('Error creating token:', error);
            throw error;
        }
    }

    async getAllTokens(): Promise<TokenData[]> {
        try {
            const response = await this.api.get('/api/tokens');
            return response.data;
        } catch (error) {
            console.error('Error fetching tokens:', error);
            throw error;
        }
    }
}

export const tokenService = new TokenService(import.meta.env.VITE_API_URL || 'http://localhost:3001');