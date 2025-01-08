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
            // Get the appropriate table based on resolution
            const tableToUse = this.TIMEFRAME_MAP[resolution as keyof typeof this.TIMEFRAME_MAP] || 'price_history_1m';

            const result = await pool.query(`
                SELECT 
                    extract(epoch from bucket) * 1000 as time,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM token_platform.${tableToUse}
                WHERE 
                    mint_address = $1 AND
                    bucket >= to_timestamp($2) AND
                    bucket <= to_timestamp($3)
                ORDER BY bucket ASC
            `, [tokenMintAddress, fromTimestamp, toTimestamp]);

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
    static async recordPrice(update: {
        mintAddress: string;
        price: number;
        marketCap?: number;
        volume?: number;
        timestamp?: Date;
    }) {
        const { mintAddress, price, volume = 0, timestamp = new Date(), marketCap } = update;

        try {
            // Get the last price point for this token within the current minute
            const lastPrice = await pool.query(`
                SELECT price, high, low, open, close
                FROM token_platform.price_history 
                WHERE mint_address = $1 
                AND time >= date_trunc('minute'::text, $2::timestamp)
                ORDER BY time DESC 
                LIMIT 1
            `, [mintAddress, timestamp]);

            const previousData = lastPrice.rows[0];

            // Calculate OHLC values
            const open = previousData?.open || price;
            const high = previousData ? Math.max(previousData.high, price) : price;
            const low = previousData ? Math.min(previousData.low, price) : price;
            const close = price;

            // Record price history
            await pool.query(`
                INSERT INTO token_platform.price_history (
                    time, mint_address, price, open, high, low, close, volume, market_cap
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (mint_address, time) DO UPDATE
                SET 
                    price = EXCLUDED.price,
                    high = GREATEST(token_platform.price_history.high, EXCLUDED.price),
                    low = LEAST(token_platform.price_history.low, EXCLUDED.price),
                    close = EXCLUDED.price,
                    volume = token_platform.price_history.volume + EXCLUDED.volume,
                    market_cap = EXCLUDED.market_cap
            `, [timestamp, mintAddress, price, open, high, low, close, volume, marketCap]);

            // Update current price and market cap in tokens table
            await pool.query(`
                UPDATE token_platform.tokens 
                SET 
                    current_price = $2,
                    market_cap_usd = $3,
                    last_price_update = $4
                WHERE mint_address = $1
            `, [mintAddress, price, marketCap, timestamp]);

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
                    extract(epoch from time) as time,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM token_platform.price_history
                WHERE mint_address = $1
                ORDER BY time ASC
            `;

            const params = [tokenMintAddress];
            const result = await pool.query(query, params);

            return result.rows.map(row => ({
                time: Math.floor(row.time) as UTCTimestamp,
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
}
