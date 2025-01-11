import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { UTCTimestamp } from 'lightweight-charts';

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
            const query = `
                SELECT 
                    EXTRACT(EPOCH FROM time_bucket($4::interval, time))::bigint as time,
                    (array_agg(price ORDER BY time ASC))[1] as open,
                    MAX(price) as high,
                    MIN(price) as low,
                    (array_agg(price ORDER BY time DESC))[1] as close,
                    SUM(volume) as volume,
                    MAX(market_cap) as market_cap
                FROM token_platform.price_history
                WHERE mint_address = $1
                AND time BETWEEN to_timestamp($2) AND to_timestamp($3)
                GROUP BY time_bucket($4::interval, time)
                ORDER BY time ASC;
            `;

            const interval = this.getTimeScaleInterval(resolution);
            const result = await pool.query(query, [
                tokenMintAddress,
                fromTimestamp,
                toTimestamp,
                interval
            ]);

            // Return Unix timestamps directly
            return result.rows;
        } catch (error) {
            logger.error('Error in getOHLCV:', error);
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
            default: return '1 minute';
        }
    }

    // This function runs after every trade to save the new price
    static async recordPrice(update: {
        mintAddress: string;
        price: number;
        marketCap?: number;
        volume?: number;
        timestamp?: Date;
        isBuy?: boolean;
    }) {
        try {
            const { mintAddress, price, volume = 0, timestamp = new Date(), marketCap = 0, isBuy } = update;

            // Round timestamp down to the start of the minute
            const currentMinute = new Date(timestamp);
            currentMinute.setSeconds(0, 0);

            // First try to update existing minute's data
            const result = await pool.query(`
                UPDATE token_platform.price_history 
                SET 
                    high = GREATEST(high, $3),
                    low = LEAST(low, $3),
                    close = $3,
                    volume = volume + $4,
                    trade_count = trade_count + 1,
                    buy_count = buy_count + CASE WHEN $6 THEN 1 ELSE 0 END,
                    sell_count = sell_count + CASE WHEN $6 THEN 0 ELSE 1 END,
                    market_cap = $5
                WHERE mint_address = $1 
                AND time = $2
                RETURNING *
            `, [mintAddress, currentMinute, price, volume, marketCap, isBuy]);

            // If no row was updated, insert a new one
            if (result.rowCount === 0) {
                await pool.query(`
                    INSERT INTO token_platform.price_history (
                        time, mint_address,
                        price, open, high, low, close,
                        volume, market_cap, is_buy,
                        trade_count, buy_count, sell_count
                    ) VALUES (
                        $1, $2,
                        $3, $3, $3, $3, $3,
                        $4, $5, $6,
                        1,
                        CASE WHEN $6 THEN 1 ELSE 0 END,
                        CASE WHEN $6 THEN 0 ELSE 1 END
                    )
                `, [currentMinute, mintAddress, price, volume, marketCap, isBuy]);
            }

        } catch (error) {
            logger.error('Error recording price:', error);
            throw error;
        }
    }

    // This function gets called when loading the price chart
    static async getPriceHistory(tokenMintAddress: string) {
        try {
            const query = `
                SELECT 
                    time,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    market_cap
                FROM token_platform.price_history
                WHERE mint_address = $1
                ORDER BY time ASC
            `;

            const params = [tokenMintAddress];
            const result = await pool.query(query, params);

            return result.rows.map(row => ({
                time: Math.floor(new Date(row.time).getTime() / 1000),
                open: Number(row.open),
                high: Number(row.high),
                low: Number(row.low),
                close: Number(row.close),
                volume: Number(row.volume)
            }));
        } catch (error) {
            logger.error('Error getting price history:', error);
            throw error;
        }
    }

    static async getVolumeStats(mintAddress: string, period: '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all') {
        try {
            const query = {
                '5m': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1m
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '5 minutes'
                `,
                '30m': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1m
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '30 minutes'
                `,
                '1h': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '1 hour'
                `,
                '4h': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '4 hours'
                `,
                '12h': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '12 hours'
                `,
                '24h': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history_1d
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '24 hours'
                `,
                'all': `
                    SELECT SUM(volume) as total_volume
                    FROM token_platform.price_history
                    WHERE mint_address = $1
                `
            }[period];

            const result = await pool.query(query, [mintAddress]);
            return Number(result.rows[0]?.total_volume || 0);
        } catch (error) {
            logger.error('Error getting volume stats:', error);
            throw error;
        }
    }

    static async getLatestPrice(tokenMintAddress: string) {
        try {
            const query = `
                SELECT 
                    EXTRACT(EPOCH FROM time)::bigint as time,
                    price,
                    price_usd,
                    market_cap
                FROM token_platform.price_history
                WHERE mint_address = $1
                ORDER BY time DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [tokenMintAddress]);

            if (result.rows.length === 0) {
                return null;
            }

            return {
                time: result.rows[0].time,
                price: Number(result.rows[0].price),
                price_usd: Number(result.rows[0].price_usd),
                market_cap: Number(result.rows[0].market_cap)
            };
        } catch (error) {
            console.error('Error in getLatestPrice:', error);
            throw error;
        }
    }
}
