import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { PriceHistoryModel } from '../../models/priceHistoryModel';
import axios from 'axios';
import { wsManager } from '../websocket/WebSocketManager';

interface JupiterResponse {
    data: {
        [key: string]: {
            id: string;
            type: 'derivedPrice' | 'buyPrice';
            price: string;
        }
    };
    timeTaken: number;
}

export class JupiterPriceUpdater {
    private static instance: JupiterPriceUpdater;
    private readonly BATCH_SIZE = 100;
    private readonly UPDATE_INTERVAL = 60000; // 1 minute
    private readonly JUPITER_RATE_LIMIT = 600; // requests per minute
    private readonly MIN_DELAY = (60 * 1000) / this.JUPITER_RATE_LIMIT;
    private isProcessing = false;
    private updateTimer: NodeJS.Timeout | null = null;

    private constructor() {
        logger.info('Initializing JupiterPriceUpdater service...');
        this.startUpdateCycle();
        logger.info('JupiterPriceUpdater service initialized and update cycle started');
    }

    static getInstance(): JupiterPriceUpdater {
        if (!JupiterPriceUpdater.instance) {
            JupiterPriceUpdater.instance = new JupiterPriceUpdater();
        }
        return JupiterPriceUpdater.instance;
    }

    private async startUpdateCycle() {
        await this.processAllTokens();
        this.updateTimer = setInterval(() => this.processAllTokens(), this.UPDATE_INTERVAL);
    }

    private async processAllTokens() {
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;
            logger.info('Starting price update cycle');

            const tokens = await this.fetchTokensForUpdate();

            const tokenBatches = this.chunkArray(tokens, this.BATCH_SIZE);

            for (const batch of tokenBatches) {
                try {
                    const prices = await this.fetchJupiterPrices(batch.map(t => t.mint_address));

                    await this.updateTokenPrices(batch, prices);
                    await this.delay(this.MIN_DELAY);
                } catch (error) {
                    logger.error('Error processing batch:', error);
                }
            }
        } catch (error) {
            logger.error('Error in price update cycle:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async fetchTokensForUpdate(): Promise<any[]> {
        try {
            const result = await pool.query(`
                SELECT 
                    mint_address,
                    supply,
                    decimals
                FROM token_platform.tokens 
                WHERE token_type = 'dex'
                AND mint_address != 'So11111111111111111111111111111111111111112'
            `);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching tokens for update:', error);
            throw error;
        }
    }

    private async fetchJupiterPrices(mintAddresses: string[]): Promise<JupiterResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(
                `https://api.jup.ag/price/v2?ids=${mintAddresses.join(',')}`,
                { signal: controller.signal }
            );

            clearTimeout(timeout);

            if (!response.ok) {
                logger.error('Error fetching Jupiter prices:', response.statusText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logger.error('Error fetching Jupiter prices:', error);
            throw error;
        }
    }

    private async updateTokenPrices(tokens: any[], priceData: JupiterResponse) {
        for (const token of tokens) {
            const priceInfo = priceData.data[token.mint_address];
            if (!priceInfo) continue;

            const price = parseFloat(priceInfo.price);
            if (!price || isNaN(price)) continue;

            // Calculate market cap if supply is available
            const marketCap = token.supply ?
                (Number(token.supply) / Math.pow(10, token.decimals)) * price :
                null;

            try {
                await pool.query(`
                    UPDATE token_platform.tokens 
                    SET 
                        current_price = $2,
                        market_cap_usd = $3,
                        last_price_update = NOW()
                    WHERE mint_address = $1
                `, [token.mint_address, price, marketCap]);

                // Broadcast the price update
                wsManager.broadcastPrice(token.mint_address, price);

                logger.debug('Updated price for token:', {
                    mintAddress: token.mint_address,
                    price,
                    marketCap
                });
            } catch (error) {
                logger.error('Error updating token price:', {
                    mintAddress: token.mint_address,
                    error
                });
            }
        }
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(array.length / size) },
            (_, i) => array.slice(i * size, i * size + size)
        );
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public cleanup(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
} 