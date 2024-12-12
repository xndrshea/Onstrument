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
            const time = Math.floor(Date.now() / 1000);
            const periodStart = Math.floor(time / 60) * 60;  // Round to nearest minute

            // First, check if we already have a candle for this minute
            const existingCandle = await pool.query(`
                SELECT price, high, low, open, volume 
                FROM token_platform.price_history
                WHERE token_address = $1 AND time = $2
            `, [tokenMintAddress, periodStart]);

            if (existingCandle.rows.length > 0) {
                // Update existing candle
                await pool.query(`
                    UPDATE token_platform.price_history 
                    SET 
                        price = $3,
                        close = $3,
                        high = GREATEST($3, high),
                        low = LEAST($3, low),
                        volume = volume + $4
                    WHERE token_address = $1 AND time = $2
                `, [tokenMintAddress, periodStart, price, volume]);
            } else {
                // Create new candle
                await pool.query(`
                    INSERT INTO token_platform.price_history 
                    (token_address, time, price, open, high, low, close, volume)
                    VALUES ($1, $2, $3, $3, $3, $3, $3, $4)
                `, [tokenMintAddress, periodStart, price, volume]);
            }
        } catch (error) {
            logger.error('Error recording price:', error);
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
                WHERE token_address = $1
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
                WHERE token_address = $1
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
