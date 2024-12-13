import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PriceUpdateQueue } from '../services/price/queue/priceUpdateQueue';

export class PriceHistoryModel {
    // This function runs after every trade to save the new price
    static async recordPrice(
        tokenMintAddress: string,  // Which token?
        price: number,             // What's the new price?
        volume: number = 0
    ) {
        // Instead of direct DB insert, use the queue
        const queue = PriceUpdateQueue.getInstance();
        await queue.addUpdate({
            mintAddress: tokenMintAddress,
            price,
            volume,
            timestamp: Math.floor(Date.now() / 1000)
        });
    }

    // This function gets called when loading the price chart
    static async getPriceHistory(tokenMintAddress: string) {
        try {
            const result = await pool.query(`
                SELECT 
                    time,
                    price as value,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM token_platform.price_history
                WHERE mint_address = $1
                ORDER BY time ASC
            `, [tokenMintAddress]);

            return result.rows;
        } catch (error) {
            logger.error('Error fetching price history:', error);
            throw error;
        }
    }

    // New method for future TradingView Advanced support
    static async getOHLCV(
        tokenMintAddress: string,
        resolution: string,
        from: number,
        to: number
    ) {
        try {
            const result = await pool.query(`
                SELECT 
                    time,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM token_platform.price_history
                WHERE mint_address = $1
                AND time BETWEEN $2 AND $3
                ORDER BY time ASC
            `, [tokenMintAddress, from, to]);

            return result.rows;
        } catch (error) {
            logger.error('Error fetching OHLCV:', error);
            throw error;
        }
    }
}
