import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { DexService } from './dexService';
import { Connection, PublicKey } from '@solana/web3.js';

interface CacheEntry {
    price: number;
    timestamp: number;
    tokenType: 'dex' | 'bonding_curve';
}

export class PriceService {
    private static instance: PriceService | null = null;
    private priceCache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_DURATION = 60 * 1000; // 60 seconds in milliseconds

    private dexService: DexService;
    private connection: Connection;

    private constructor(connection: Connection) {
        this.connection = connection;
        this.dexService = new DexService();
    }

    static getInstance(connection: Connection): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService(connection);
        }
        return PriceService.instance;
    }

    async getTokenPrice(mintAddress: string, tokenType: 'dex' | 'bonding_curve'): Promise<number> {
        try {
            // Check cache first
            const cached = this.priceCache.get(mintAddress);
            const now = Date.now();

            if (cached &&
                cached.tokenType === tokenType &&
                (now - cached.timestamp) < this.CACHE_DURATION) {
                logger.debug(`Cache hit for ${tokenType} token ${mintAddress}`);
                return cached.price;
            }

            // Get fresh price based on token type
            const price = await this.fetchFreshPrice(mintAddress, tokenType);

            // Update cache with token type
            this.priceCache.set(mintAddress, {
                price,
                timestamp: now,
                tokenType
            });

            // Record price in history
            await this.recordPriceHistory(mintAddress, price);

            return price;
        } catch (error) {
            logger.error(`Error fetching price for ${tokenType} token ${mintAddress}:`, error);
            throw error;
        }
    }

    private async fetchFreshPrice(mintAddress: string, tokenType: 'dex' | 'bonding_curve'): Promise<number> {
        if (tokenType === 'dex') {
            return await this.dexService.getTokenPrice(mintAddress);
        } else {
            const token = await this.getTokenConfig(mintAddress);
            if (!token?.curve_address) {
                throw new Error('Bonding curve configuration not found');
            }

            const price = await this.fetchBondingCurvePrice(mintAddress, token.curve_address);
            return price;
        }
    }

    private async fetchBondingCurvePrice(mintAddress: string, curveAddress: string): Promise<number> {
        throw new Error('Not implemented');
    }

    private async getTokenConfig(mintAddress: string) {
        const result = await pool.query(
            'SELECT curve_address FROM token_platform.tokens WHERE mint_address = $1',
            [mintAddress]
        );
        return result.rows[0];
    }

    public async recordPriceHistory(mintAddress: string, price: number, totalSupply?: number) {
        try {
            const currentTimestamp = Math.floor(Date.now() / 1000);

            // Check for existing price at this timestamp
            const existingPrice = await pool.query(`
                SELECT price FROM token_platform.price_history 
                WHERE token_mint_address = $1 
                AND timestamp = to_timestamp($2)
            `, [mintAddress, currentTimestamp]);

            // Only insert if price changed or no price exists
            if (existingPrice.rows.length === 0 || existingPrice.rows[0].price !== price) {
                logger.info(`Recording new price for ${mintAddress}: ${price} SOL`);
                await pool.query(`
                    INSERT INTO token_platform.price_history 
                    (token_mint_address, price, total_supply, timestamp)
                    VALUES ($1, $2, $3, to_timestamp($4))
                `, [
                    mintAddress,
                    price,
                    totalSupply || null,
                    currentTimestamp
                ]);
            }
        } catch (error) {
            logger.error('Error recording price history:', error);
            // Don't throw error here to prevent price fetching from failing
        }
    }

    // Get price history for a token
    async getPriceHistory(mintAddress: string): Promise<Array<{ timestamp: number; price: number }>> {
        try {
            const result = await pool.query(`
                SELECT timestamp, price
                FROM token_platform.price_history
                WHERE token_mint_address = $1
                ORDER BY timestamp DESC
                LIMIT 100
            `, [mintAddress]);

            return result.rows;
        } catch (error) {
            logger.error(`Error fetching price history for token ${mintAddress}:`, error);
            throw error;
        }
    }

    // Clear cache for testing or maintenance
    clearCache(): void {
        this.priceCache.clear();
    }
}