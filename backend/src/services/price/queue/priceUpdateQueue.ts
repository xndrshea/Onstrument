import { PriceUpdate } from '../processors/baseProcessor';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { logger } from '../../../utils/logger';

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
        this.queue.push(update);
        if (this.queue.length >= this.BATCH_SIZE) {
            await this.processBatch();
        }
    }

    private async processBatch(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;

        const startTime = Date.now();
        this.processing = true;
        const batch = this.queue.splice(0, this.BATCH_SIZE);

        try {
            await Promise.all(batch.map(update =>
                PriceHistoryModel.recordPrice(
                    update.mintAddress,
                    update.price,
                    update.volume || 0
                )
            ));
            this.processedCount += batch.length;
        } catch (error) {
            this.failedCount += batch.length;
            this.queue.unshift(...batch);
            throw error;
        } finally {
            this.lastProcessingTime = Date.now() - startTime;
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
