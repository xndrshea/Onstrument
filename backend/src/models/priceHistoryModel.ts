import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceHistoryModel {
    // This function runs after every trade to save the new price
    static async recordPrice(
        tokenMintAddress: string,  // Which token?
        price: number,             // What's the new price?
        volume: number = 0
    ) {
        try {
            logger.info('Starting recordPrice operation:', {
                tokenMintAddress,
                price,
                volume,
                timestamp: new Date().toISOString()
            });

            const time = Math.floor(Date.now() / 1000);
            const periodStart = Math.floor(time / 60) * 60;

            // Record the price with OHLC data
            const priceHistoryResult = await pool.query(`
                INSERT INTO token_platform.price_history
                (mint_address, time, price, open, high, low, close, volume)
                VALUES ($1, $2, $3, $3, $3, $3, $3, $4)
                ON CONFLICT (mint_address, time) 
                DO UPDATE SET
                    high = GREATEST(token_platform.price_history.high, $3),
                    low = LEAST(token_platform.price_history.low, $3),
                    close = $3,
                    volume = token_platform.price_history.volume + $4
                RETURNING *
            `, [tokenMintAddress, periodStart, price, volume]);

            logger.debug('Price history insert result:', {
                tokenMintAddress,
                rowCount: priceHistoryResult.rowCount,
                price,
                volume,
                result: priceHistoryResult.rows[0]
            });

            return priceHistoryResult.rows[0];
        } catch (error) {
            logger.error('Error in recordPrice:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                tokenMintAddress,
                price,
                volume
            });
            throw error;
        }
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
