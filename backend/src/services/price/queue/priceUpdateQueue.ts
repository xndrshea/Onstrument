import { PriceUpdate } from './types';
import { logger } from '../../../utils/logger';
import { pool } from '../../../config/database';

export class PriceUpdateQueue {
    private static readonly BATCH_SIZE = 100;
    private static readonly PROCESS_INTERVAL = 1000; // 1 second
    private static instance: PriceUpdateQueue;
    private queue: PriceUpdate[] = [];
    private processing = false;

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
        if (this.processing) return;

        this.processing = true;
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
            const timestamp = new Date(update.timestamp);

            // Get the last price point for this token within the last minute
            const lastPrice = await pool.query(`
                SELECT price, high, low
                FROM token_platform.price_history 
                WHERE mint_address = $1 
                AND time >= NOW() - INTERVAL '1 minute'
                ORDER BY time DESC 
                LIMIT 1
            `, [update.mintAddress]);

            const previousData = lastPrice.rows[0];

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
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $3,
                    $7
                )
                ON CONFLICT (mint_address, time) DO UPDATE
                SET 
                    price = $3,
                    high = GREATEST(token_platform.price_history.high, $3),
                    low = LEAST(token_platform.price_history.low, $3),
                    close = $3,
                    volume = token_platform.price_history.volume + $7
            `, [
                timestamp,
                update.mintAddress,
                update.price,
                previousData?.price || update.price,  // open
                Math.max(previousData?.high || update.price, update.price),  // high
                Math.min(previousData?.low || update.price, update.price),   // low
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
            isProcessing: this.processing
        };
    }

    async processBatch() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const batch = this.queue.splice(0, PriceUpdateQueue.BATCH_SIZE);

        try {
            await pool.query(`
                INSERT INTO token_platform.price_history (
                    time, mint_address, price, volume
                )
                SELECT * FROM UNNEST ($1::timestamptz[], $2::text[], $3::numeric[], $4::numeric[])
            `, [
                batch.map(u => new Date(u.timestamp)),
                batch.map(u => u.mintAddress),
                batch.map(u => u.price),
                batch.map(u => u.volume || 0)
            ]);
        } catch (error) {
            logger.error('Batch processing failed:', error);
            // Re-queue failed updates
            this.queue.unshift(...batch);
        } finally {
            this.processing = false;
        }
    }
}
