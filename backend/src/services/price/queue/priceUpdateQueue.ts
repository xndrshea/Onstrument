import { PriceUpdate } from './types';
import { logger } from '../../../utils/logger';
import { pool } from '../../../config/database';

export class PriceUpdateQueue {
    private static instance: PriceUpdateQueue;
    private queue: PriceUpdate[] = [];
    private isProcessing = false;

    public static getInstance(): PriceUpdateQueue {
        if (!PriceUpdateQueue.instance) {
            PriceUpdateQueue.instance = new PriceUpdateQueue();
        }
        return PriceUpdateQueue.instance;
    }

    constructor() {
        // Start processing the queue immediately
        this.startProcessing();
    }

    private async startProcessing() {
        if (this.isProcessing) return;

        this.isProcessing = true;
        logger.info('Starting price update queue processor');

        while (true) {
            try {
                // Process items in batches for better performance
                while (this.queue.length > 0) {
                    const update = this.queue.shift()!;
                    await this.processUpdate(update);
                }
                // Only sleep if queue is empty
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error('Error processing price update:', error);
            }
        }
    }

    private async processUpdate(update: PriceUpdate) {
        try {
            // Use time_bucket for 1-minute OHLCV candles
            await pool.query(`
                INSERT INTO token_platform.price_history (
                    time,
                    mint_address,
                    price,
                    open,
                    high,
                    low,
                    close,
                    volume
                )
                VALUES (
                    time_bucket('1 minute', to_timestamp($1)),
                    $2,
                    $3,
                    COALESCE((
                        SELECT open 
                        FROM token_platform.price_history 
                        WHERE mint_address = $2 
                        AND time = time_bucket('1 minute', to_timestamp($1))
                    ), $3),
                    GREATEST(COALESCE((
                        SELECT high 
                        FROM token_platform.price_history 
                        WHERE mint_address = $2 
                        AND time = time_bucket('1 minute', to_timestamp($1))
                    ), $3), $3),
                    LEAST(COALESCE((
                        SELECT low 
                        FROM token_platform.price_history 
                        WHERE mint_address = $2 
                        AND time = time_bucket('1 minute', to_timestamp($1))
                    ), $3), $3),
                    $3,
                    $4
                )
                ON CONFLICT (mint_address, time) DO UPDATE
                SET 
                    high = GREATEST(token_platform.price_history.high, EXCLUDED.high),
                    low = LEAST(token_platform.price_history.low, EXCLUDED.low),
                    close = EXCLUDED.close,
                    volume = token_platform.price_history.volume + EXCLUDED.volume
            `, [
                update.timestamp / 1000,
                update.mintAddress,
                update.price,
                update.volume || 0
            ]);
        } catch (error) {
            logger.error('Failed to process price update:', {
                error,
                update
            });
        }
    }

    public async add(update: PriceUpdate) {
        this.queue.push(update);
        logger.info('Added price update to queue. Queue length:', this.queue.length);
    }

    public async addUpdate(update: PriceUpdate): Promise<void> {
        this.queue.push(update);
        logger.info('Added price update to queue:', {
            mintAddress: update.mintAddress,
            price: update.price,
            queueLength: this.queue.length
        });
    }

    public getMetrics() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing
        };
    }
}
