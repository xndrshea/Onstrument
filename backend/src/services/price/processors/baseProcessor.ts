import { EventEmitter } from 'events';
import { PriceUpdateQueue } from '../queue/priceUpdateQueue';
import { logger } from '../../../utils/logger';
import { pool } from '../../../config/database';
import { PriceUpdate } from '../queue/types';
export abstract class BaseProcessor extends EventEmitter {
    protected static isActive: boolean = false;
    protected static lastProcessedTime: number = 0;
    protected static processedCount: number = 0;

    public static getStatus() {
        return {
            isActive: this.isActive,
            lastProcessedTime: this.lastProcessedTime,
            processedCount: this.processedCount
        };
    }

    protected queue: PriceUpdateQueue;

    constructor() {
        super();
        this.queue = PriceUpdateQueue.getInstance();
    }

    protected async queuePriceUpdate(update: PriceUpdate) {
        try {
            await this.queue.add(update);
            this.emit('priceUpdate', update);
        } catch (error) {
            logger.error(`Error queueing price update: ${error}`);
        }
    }

    protected async recordTrade(trade: {
        signature: string;
        tokenAddress: string;
        tokenType: 'pool' | 'custom';
        walletAddress: string;
        side: 'buy' | 'sell';
        amount: number;
        total: number;
        price: number;
        slot: number;
    }) {
        try {
            await pool.query(`
                INSERT INTO token_platform.trades (
                    signature,
                    token_address,
                    token_type,
                    wallet_address,
                    side,
                    amount,
                    total,
                    price,
                    slot
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (signature) DO NOTHING
            `, [
                trade.signature,
                trade.tokenAddress,
                trade.tokenType,
                trade.walletAddress,
                trade.side,
                trade.amount,
                trade.total,
                trade.price,
                trade.slot
            ]);
        } catch (error) {
            logger.error('Error recording trade:', error);
        }
    }

    abstract processEvent(buffer: Buffer, accountKey: string, programId: string): Promise<void>;
}
