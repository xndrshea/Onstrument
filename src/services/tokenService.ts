import { PublicKey } from '@solana/web3.js'
import axios, { AxiosInstance } from 'axios'

export interface TokenBondingCurveConfig {
    curveType: 'linear' | 'exponential' | 'logarithmic';
    basePrice: number;
    slope?: number;
    exponent?: number;
    logBase?: number;
}

export interface TokenMetadata {
    currentSupply: number;
    solReserves: number;
    bondingCurveATA: string;
    [key: string]: any; // Allow for additional metadata fields
}

export interface TokenData {
    id?: number;
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    metadata: TokenMetadata;
    bonding_curve_config: TokenBondingCurveConfig;
    created_at?: string;
}

export interface TokenCreationData {
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    creator?: string;
    total_supply: number;
    network?: string;
    metadata: {
        bondingCurveATA: string;
    };
    bondingCurveConfig: {
        curveType: string;
        basePrice: number;
        slope?: number;
        exponent?: number;
        logBase?: number;
    };
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

    async updateTokenReserves(mintAddress: string, solReserves: number): Promise<{ success: boolean; localOnly?: boolean }> {
        try {
            const response = await this.api.put(`/api/tokens/${mintAddress}/reserves`, { solReserves });

            if (!response.ok) {
                console.warn('Failed to update token reserves on server');
                return { success: true, localOnly: true };
            }

            return { success: true };
        } catch (error) {
            console.warn('Error updating token reserves:', error);
            return { success: true, localOnly: true };
        }
    }
}

export const tokenService = new TokenService(import.meta.env.VITE_API_URL || 'http://localhost:3001');