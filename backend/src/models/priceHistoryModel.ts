import { pool } from '../config/database';
import { logger } from '../utils/logger';
export class PriceHistoryModel {
    // Map TradingView intervals to our base aggregates
    private static readonly TIMEFRAME_MAP = {
        // Use 1m aggregate for <= 1h
        '1': 'price_history_1m',
        '3': 'price_history_1m',
        '5': 'price_history_1m',
        '15': 'price_history_1m',
        '30': 'price_history_1m',
        '60': 'price_history_1m',

        // Use 1h aggregate for > 1h and < 1d
        '120': 'price_history_1h',
        '240': 'price_history_1h',
        '360': 'price_history_1h',
        '720': 'price_history_1h',

        // Use 1d aggregate for >= 1d
        'D': 'price_history_1d',
        'W': 'price_history_1d',
        'M': 'price_history_1d'
    } as const;

    static async getOHLCV(
        tokenMintAddress: string,
        resolution: string,
        fromTimestamp: number,
        toTimestamp: number
    ) {
        try {
            // Select appropriate time bucket based on resolution
            const timeBucket = resolution === '1D' ? '1 day' :
                resolution === '1H' ? '1 hour' :
                    '1 minute';

            const result = await pool.query(`
                SELECT 
                    extract(epoch from time_bucket($1, time)) * 1000 as time,
                    first(open, time) as open,
                    max(high) as high,
                    min(low) as low,
                    last(close, time) as close,
                    sum(volume) as volume
                FROM token_platform.price_history
                WHERE 
                    mint_address = $2 AND
                    time >= to_timestamp($3) AND
                    time <= to_timestamp($4)
                GROUP BY time_bucket($1, time)
                ORDER BY time_bucket($1, time) ASC
            `, [timeBucket, tokenMintAddress, fromTimestamp, toTimestamp]);

            return result.rows;
        } catch (error) {
            logger.error('Error fetching OHLCV data:', error);
            throw error;
        }
    }

    private static getTimeScaleInterval(resolution: string): string {
        switch (resolution) {
            case '1': return '1 minute';
            case '3': return '3 minutes';
            case '5': return '5 minutes';
            case '15': return '15 minutes';
            case '30': return '30 minutes';
            case '60': return '1 hour';
            case '120': return '2 hours';
            case '240': return '4 hours';
            case 'D': return '1 day';
            case 'W': return '1 week';
            case 'M': return '1 month';
            default: return '1 hour';
        }
    }

    // This function runs after every trade to save the new price
    static async recordPrice(
        tokenMintAddress: string,
        price: number,
        volume: number = 0
    ) {
        try {
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
                ) VALUES (
                    NOW(),
                    $1,
                    $2,
                    $2,
                    $2,
                    $2,
                    $2,
                    $3
                )
            `, [tokenMintAddress, price, volume]);
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
                    extract(epoch from time) * 1000 as time,
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
}
