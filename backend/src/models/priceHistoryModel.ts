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
    static async recordPrice(update: {
        mintAddress: string;
        price: number;
        volume?: number;
        timestamp?: Date;
    }) {
        const { mintAddress, price, volume = 0, timestamp = new Date() } = update;

        try {
            if (!isFinite(price) || price <= 0) {
                logger.error(`Invalid price for ${mintAddress}:`, { price, volume });
                return;
            }

            // Start a transaction
            await pool.query('BEGIN');

            // Get token's total supply
            const tokenResult = await pool.query(
                'SELECT total_supply FROM token_platform.tokens WHERE mint_address = $1',
                [mintAddress]
            );
            const totalSupply = tokenResult.rows[0]?.total_supply;

            // Calculate market cap if total supply exists
            const marketCap = totalSupply ? price * totalSupply : null;

            // Get the last price point for this token within the current minute
            const lastPrice = await pool.query(`
                SELECT price, high, low, open
                FROM token_platform.price_history 
                WHERE mint_address = $1 
                AND time >= date_trunc('minute'::text, $2::timestamp)
                ORDER BY time DESC 
                LIMIT 1
            `, [mintAddress, timestamp]);

            const previousData = lastPrice.rows[0];

            // Update both price history and current price/market cap
            await Promise.all([
                // Update price history
                pool.query(`
                    INSERT INTO token_platform.price_history (
                        time,
                        mint_address,
                        price,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        market_cap
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $3,
                        $7,
                        $8
                    )
                    ON CONFLICT (mint_address, time) DO UPDATE
                    SET 
                        price = EXCLUDED.price,
                        high = GREATEST(token_platform.price_history.high, EXCLUDED.price),
                        low = LEAST(token_platform.price_history.low, EXCLUDED.price),
                        close = EXCLUDED.price,
                        volume = token_platform.price_history.volume + EXCLUDED.volume,
                        market_cap = EXCLUDED.market_cap
                `, [
                    timestamp,
                    mintAddress,
                    price,
                    previousData?.open || price,
                    Math.max(previousData?.high || price, price),
                    Math.min(previousData?.low || price, price),
                    volume,
                    marketCap
                ]),

                // Update current price and market cap in tokens table
                pool.query(`
                    UPDATE token_platform.tokens 
                    SET 
                        current_price = $2,
                        market_cap = $3
                    WHERE mint_address = $1
                `, [mintAddress, price, marketCap])
            ]);

            await pool.query('COMMIT');

        } catch (error) {
            await pool.query('ROLLBACK');
            logger.error('Error recording price:', error);
            throw error;
        }
    }

    // This function gets called when loading the price chart
    static async getPriceHistory(tokenMintAddress: string, tokenType?: string) {
        try {
            const query = `
                SELECT 
                    time_bucket('3 seconds', time) as time,
                    last(price, time) as value
                FROM token_platform.price_history ph
                JOIN token_platform.tokens t ON t.mint_address = ph.mint_address
                WHERE 
                    ph.mint_address = $1
                    ${tokenType ? 'AND t.token_type = $2' : ''}
                    AND time >= NOW() - INTERVAL '7 days'
                GROUP BY 1
                ORDER BY 1 ASC
            `;

            const params = tokenType ? [tokenMintAddress, tokenType] : [tokenMintAddress];
            const result = await pool.query(query, params);

            return result.rows.map(row => ({
                time: Math.floor(Date.parse(row.time) / 1000),
                value: Number(row.value)
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
