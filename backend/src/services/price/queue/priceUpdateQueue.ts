import { PriceUpdate } from '../processors/baseProcessor';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { logger } from '../../../utils/logger';
import { QueueMetrics } from './types';

export class PriceUpdateQueue {
    private static instance: PriceUpdateQueue;
    private queue: PriceUpdate[] = [];
    private processing = false;
    private readonly BATCH_SIZE = 1000;
    private readonly FLUSH_INTERVAL = 1000; // 1 second
    private processedCount = 0;
    private failedCount = 0;
    private lastProcessingTime = 0;

    private constructor() {
        setInterval(() => this.processBatch(), this.FLUSH_INTERVAL);
    }

    static getInstance(): PriceUpdateQueue {
        if (!this.instance) {
            this.instance = new PriceUpdateQueue();
        }
        return this.instance;
    }

    async add(update: PriceUpdate): Promise<void> {
        logger.info('Adding price update to queue:', {
            mintAddress: update.mintAddress,
            price: update.price,
            volume: update.volume,
            source: update.source,
            queueLength: this.queue.length + 1
        });

        this.queue.push(update);

        if (this.queue.length >= this.BATCH_SIZE) {
            logger.info('Queue reached batch size, processing...', {
                batchSize: this.BATCH_SIZE,
                queueLength: this.queue.length
            });
            await this.processBatch();
        }
    }

    private async processBatch(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            logger.debug('Skipping batch process:', {
                isProcessing: this.processing,
                queueLength: this.queue.length
            });
            return;
        }

        this.processing = true;
        const startTime = Date.now();
        const batch = this.queue.splice(0, this.BATCH_SIZE);

        try {
            logger.info('Processing price update batch:', {
                batchSize: batch.length,
                firstUpdate: batch[0],
                lastUpdate: batch[batch.length - 1]
            });

            for (const update of batch) {
                await PriceHistoryModel.recordPrice(
                    update.mintAddress,
                    update.price,
                    update.volume
                );
            }

            const duration = Date.now() - startTime;
            logger.info('Batch processing complete:', {
                processedCount: batch.length,
                durationMs: duration,
                remainingInQueue: this.queue.length
            });
        } catch (error) {
            logger.error('Error processing batch:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                batchSize: batch.length
            });
        } finally {
            this.processing = false;
        }
    }

    public getMetrics(): QueueMetrics {
        return {
            queueLength: this.queue.length,
            processedCount: this.processedCount,
            failedCount: this.failedCount,
            lastProcessingTime: this.lastProcessingTime
        };
    }
}
