import { logger } from '../utils/logger';
import { pool } from '../config/database';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { PriceService } from './PriceService';

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
    poolAddress: string;
    decimals?: number;
    price: number;
    volume24h: number;
    liquidity: number;
    priceChange24h: number;
    totalSupply?: number;
}

export class DexService {
    private static RAYDIUM_API = 'https://api.raydium.io/v2';
    private static MAX_TOKENS = 20; // Limit to top 20 tokens
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
            const pairs: RaydiumPair[] = response.data;

            // Sort by liquidity and take top 20
            const topPairs = pairs
                .sort((a, b) => b.liquidity - a.liquidity)
                .slice(0, DexService.MAX_TOKENS);

            logger.info(`Fetched ${topPairs.length} top tokens from Raydium`);

            return topPairs.map(pair => ({
                mintAddress: pair.baseMint,
                name: pair.name.split('-')[0].trim(), // Take the base token name
                symbol: pair.name.split('-')[0].trim(),
                poolAddress: pair.ammId,
                decimals: pair.baseDecimals,
                price: pair.basePrice,
                volume24h: pair.volume24h,
                liquidity: pair.liquidity,
                priceChange24h: pair.priceChange24h
            }));
        } catch (error) {
            logger.error('Error fetching top tokens:', error);
            throw error;
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
            const priceService = PriceService.getInstance(this.connection);
            await priceService.recordPriceHistory(mintAddress, pool.price);

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

    async updateTokensInDatabase(tokens: TokenData[]) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // First ensure token_stats table exists
            await client.query(`
                CREATE TABLE IF NOT EXISTS token_platform.token_stats (
                    token_id INTEGER REFERENCES token_platform.tokens(id),
                    price DECIMAL,
                    volume_24h DECIMAL,
                    price_change_24h DECIMAL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (token_id)
                );
            `);

            for (const token of tokens) {
                // First insert/update the token
                const tokenResult = await client.query(`
                    INSERT INTO token_platform.tokens (
                        mint_address, name, symbol, token_type, 
                        total_supply, decimals, dex_pool_address
                    ) VALUES ($1, $2, $3, 'dex', $4, $5, $6)
                    ON CONFLICT (mint_address) 
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        symbol = EXCLUDED.symbol
                    RETURNING id
                `, [
                    token.mintAddress,
                    token.name,
                    token.symbol,
                    token.totalSupply || 0,
                    token.decimals || 9,
                    token.poolAddress
                ]);

                const tokenId = tokenResult.rows[0].id;

                // Then update stats
                await client.query(`
                    INSERT INTO token_platform.token_stats (
                        token_id, price, volume_24h, price_change_24h
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (token_id) 
                    DO UPDATE SET
                        price = EXCLUDED.price,
                        volume_24h = EXCLUDED.volume_24h,
                        price_change_24h = EXCLUDED.price_change_24h,
                        last_updated = CURRENT_TIMESTAMP
                `, [
                    tokenId,
                    token.price,
                    token.volume24h,
                    token.priceChange24h
                ]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}