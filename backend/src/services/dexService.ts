import { logger } from '../utils/logger';
import { pool } from '../config/database';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { PriceHistoryModel } from '../models/priceHistoryModel';

interface RaydiumPair {
    ammId: string;
    apr24h: number;
    apr7d: number;
    apr30d: number;
    baseMint: string;
    baseDecimals: number;
    basePrice: number;
    baseVault: string;
    fee7d: number;
    fee24h: number;
    fee30d: number;
    liquidity: number;
    lpMint: string;
    lpPrice: number;
    name: string;
    price: number;
    priceChange24h: number;
    quoteMint: string;
    quoteDecimals: number;
    quotePrice: number;
    quoteVault: string;
    volume7d: number;
    volume24h: number;
    volume30d: number;
}

interface TokenData {
    mintAddress: string;
    name: string;
    symbol: string;
    supply: string;
    decimals: number;
    poolAddress: string;
    volume24h: number;
    priceChange24h: number;
    price: number;
}

export class DexService {
    private static RAYDIUM_API = 'https://api.raydium.io/v2';
    private connection: Connection;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.connection = new Connection(process.env.SOLANA_RPC_URL || '');
        this.startTokenUpdates();
    }

    private async startTokenUpdates() {
        try {
            // Initial update
            await this.getTopTokens();

            // Set up interval for updates
            this.updateInterval = setInterval(async () => {
                try {
                    await this.getTopTokens();
                } catch (error) {
                    logger.error('Error in periodic token update:', error);
                }
            }, 30000); // Every 30 seconds
        } catch (error) {
            logger.error('Error starting token updates:', error);
        }
    }

    public cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    async getTopTokens(): Promise<TokenData[]> {
        try {
            const response = await axios.get(`${DexService.RAYDIUM_API}/main/pairs`);

            // Validate API response
            if (!response?.data?.data || !Array.isArray(response.data.data)) {
                logger.error('Invalid Raydium API response:', response?.data);
                return [];
            }

            // Extract and transform token data from pairs
            const pairs: RaydiumPair[] = response.data.data;
            const tokens: TokenData[] = pairs
                // Filter criteria for quality tokens
                .filter(pair => {
                    // Null check each property before using
                    return pair
                        && pair.baseMint
                        && pair.name
                        && typeof pair.volume24h === 'number'
                        && typeof pair.liquidity === 'number'
                        && (pair.volume24h ?? 0) > 1000
                        && (pair.liquidity ?? 0) > 10000
                        && !pair.name.includes('UNKNOWN');
                })
                // Sort by volume
                .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
                // Transform to our format
                .map(pair => ({
                    mintAddress: pair.baseMint || '',
                    name: (pair.name || '').split('-')[0].trim(),
                    symbol: (pair.name || '').split('-')[0].trim(),
                    supply: pair.baseVault || '',
                    decimals: pair.baseDecimals || 0,
                    poolAddress: pair.ammId || '',
                    volume24h: pair.volume24h || 0,
                    priceChange24h: pair.priceChange24h || 0,
                    price: pair.basePrice || 0
                }))
                .slice(0, 50); // Take top 50 by volume

            if (!Array.isArray(tokens)) {
                logger.error('Token transformation failed - not an array');
                return [];
            }

            if (tokens.length > 0) {
                try {
                    await this.updateTokensInDatabase(tokens);
                    logger.info(`Fetched ${tokens.length} quality tokens from Raydium`);
                } catch (dbError) {
                    logger.error('Database update failed:', dbError);
                    // Continue even if DB update fails
                }
            }

            return tokens;
        } catch (error) {
            logger.error('Error fetching top tokens:', error);
            return [];
        }
    }

    async getTokenPrice(mintAddress: string): Promise<number> {
        try {
            const result = await pool.query(`
                SELECT price FROM token_platform.token_stats 
                WHERE token_id = (
                    SELECT id FROM token_platform.tokens 
                    WHERE mint_address = $1
                )
            `, [mintAddress]);

            return result.rows[0]?.price || 0;
        } catch (error) {
            logger.error('Error fetching token price:', error);
            throw error;
        }
    }

    async getPoolInfo(mintAddress: string) {
        try {
            // Get pool info from Raydium API
            const response = await axios.get(`${DexService.RAYDIUM_API}/main/pairs`);
            const pool = response.data.data.find(
                (p: any) => p.baseMint === mintAddress || p.quoteMint === mintAddress
            );

            if (!pool) {
                throw new Error('Pool not found');
            }

            // Store in our database for price history
            await this.recordPoolPrice(mintAddress, pool.price);

            return {
                poolAddress: pool.ammId,
                price: pool.price,
                liquidity: pool.liquidity,
                volume24h: pool.volume24h
            };
        } catch (error) {
            logger.error('Error fetching pool info:', error);
            throw error;
        }
    }

    private async updateTokensInDatabase(tokens: TokenData[]) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // First check if token_type column exists
            const columnExists = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tokens' 
                AND column_name = 'token_type'
            `);

            // If column doesn't exist, add it
            if (columnExists.rows.length === 0) {
                await client.query(`
                    ALTER TABLE token_platform.tokens 
                    ADD COLUMN token_type VARCHAR(20) DEFAULT 'dex'
                `);
            }

            // Update query to include price
            const query = `
                INSERT INTO token_platform.tokens (
                    mint_address,
                    name,
                    symbol,
                    token_type,
                    total_supply,
                    decimals,
                    dex_pool_address,
                    volume_24h,
                    price_change_24h
                ) VALUES ($1, $2, $3, 'dex', $4, $5, $6, $7, $8)
                ON CONFLICT (mint_address) 
                DO UPDATE SET
                    volume_24h = EXCLUDED.volume_24h,
                    price_change_24h = EXCLUDED.price_change_24h,
                    dex_pool_address = EXCLUDED.dex_pool_address
            `;

            // Record tokens and their prices
            await Promise.all(tokens.map(async token => {
                await client.query(query, [
                    token.mintAddress,
                    token.name,
                    token.symbol,
                    token.supply || '0',
                    token.decimals || 9,
                    token.poolAddress,
                    token.volume24h || 0,
                    token.priceChange24h || 0
                ]);

                // Also record the price history
                if (token.price) {
                    await PriceHistoryModel.recordPrice(
                        token.mintAddress,
                        token.price,
                        token.supply ? Number(token.supply) : 0
                    );
                }
            }));

            await client.query('COMMIT');
            logger.info(`Updated ${tokens.length} tokens in database`);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error updating tokens in database:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    private async recordPoolPrice(mintAddress: string, price: number) {
        await pool.query(`
            INSERT INTO token_platform.price_history (
                token_id,
                price,
                timestamp
            ) VALUES (
                (SELECT id FROM token_platform.tokens WHERE mint_address = $1),
                $2,
                NOW()
            )
        `, [mintAddress, price]);
    }
}