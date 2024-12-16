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
            const timestamp = new Date();

            // First check if we have a price point in the current minute
            const lastPrice = await pool.query(`
                SELECT price, high, low
                FROM token_platform.price_history 
                WHERE mint_address = $1 
                AND time >= date_trunc('minute', NOW())
                ORDER BY time DESC 
                LIMIT 1
            `, [tokenMintAddress]);

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
                ) VALUES (
                    date_trunc('minute', $1),  -- Round to minute for proper bucketing
                    $2,
                    $3,
                    $4,  -- Use previous price as open if exists
                    $5,  -- Max of previous high and current
                    $6,  -- Min of previous low and current
                    $3,  -- Current price is always close
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
                tokenMintAddress,
                price,
                previousData?.price || price,  // open
                Math.max(previousData?.high || price, price),  // high
                Math.min(previousData?.low || price, price),   // low
                volume
            ]);
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
                    EXTRACT(EPOCH FROM time) * 1000 as time,
                    close::float as value
                FROM token_platform.price_history
                WHERE 
                    mint_address = $1 
                    AND time >= NOW() - INTERVAL '7 days'
                ORDER BY time ASC
            `, [tokenMintAddress]);

            // Debug logging
            logger.info(`Found ${result.rows.length} price points for ${tokenMintAddress}`);
            if (result.rows.length > 0) {
                logger.info('Sample point:', result.rows[0]);
            }

            return result.rows;
        } catch (error) {
            logger.error('Error getting price history:', error);
            throw error;
        }
    }
}
