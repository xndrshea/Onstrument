import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PriceUpdateQueue } from '../services/price/queue/priceUpdateQueue';

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
        from: number,
        to: number
    ) {
        try {
            const interval = this.getTimeScaleInterval(resolution);
            const sourceView = this.TIMEFRAME_MAP[resolution as keyof typeof this.TIMEFRAME_MAP] || 'price_history_1h';

            const result = await pool.query(`
                WITH source_data AS (
                    SELECT 
                        time_bucket($1, bucket) as time,
                        first(open, bucket) as open,
                        max(high) as high,
                        min(low) as low,
                        last(close, bucket) as close,
                        sum(volume) as volume
                    FROM token_platform.${sourceView}
                    WHERE 
                        mint_address = $2
                        AND bucket >= to_timestamp($3)
                        AND bucket <= to_timestamp($4)
                    GROUP BY 1
                )
                SELECT * FROM source_data 
                WHERE time IS NOT NULL
                ORDER BY time ASC
            `, [interval, tokenMintAddress, from / 1000, to / 1000]);

            return result.rows.map(row => ({
                time: Math.floor(new Date(row.time).getTime() / 1000),
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseFloat(row.volume)
            }));
        } catch (error) {
            logger.error('Error fetching OHLCV:', error);
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
