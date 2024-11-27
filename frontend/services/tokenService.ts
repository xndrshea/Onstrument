import { TokenRecord, createTokenParams } from '../../shared/types/token';
import { logger } from '../utils/logger';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

export class TokenService {
    async create(params: createTokenParams): Promise<TokenRecord> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logger.error('Error creating token:', error);
            throw error;
        }
    }

    async getAllTokens(): Promise<TokenRecord[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            logger.error('Error fetching tokens:', error);
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