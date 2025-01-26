import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceHistoryModel {

    static async getOHLCV(
        tokenMintAddress: string,
        resolution: string,
        fromTimestamp: number,
        toTimestamp: number
    ) {
        try {
            const viewName = resolution === 'D' ? 'price_history_1d' :
                (parseInt(resolution) >= 60 ? 'price_history_1h' :
                    'price_history_1m');

            // Cast to float8 (double precision) for the chart display
            const query = `
                SELECT 
                    EXTRACT(EPOCH FROM bucket)::bigint as time,
                    open::float8 as open,
                    high::float8 as high,
                    low::float8 as low,
                    close::float8 as close,
                    volume::float8 as volume,
                    market_cap::float8 as market_cap
                FROM onstrument.${viewName}
                WHERE mint_address = $1
                AND bucket BETWEEN to_timestamp($2) AND to_timestamp($3)
                ORDER BY bucket ASC;
            `;

            const result = await pool().query(query, [
                tokenMintAddress,
                fromTimestamp,
                toTimestamp
            ]);

            // Force number conversion
            const processedRows = result.rows.map(row => ({
                time: Number(row.time),
                open: Number(row.open),
                high: Number(row.high),
                low: Number(row.low),
                close: Number(row.close),
                volume: Number(row.volume),
                market_cap: Number(row.market_cap)
            }));

            return processedRows;
        } catch (error) {
            logger.error('Error in getOHLCV:', error);
            throw error;
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
            const { mintAddress, price, volume = 0, timestamp = new Date(), marketCap, isBuy } = update;

            // Round timestamp down to the start of the minute
            const currentMinute = new Date(timestamp);
            currentMinute.setSeconds(0, 0);

            const client = await pool().connect();
            try {
                await client.query('BEGIN');

                // First try to update existing minute's data
                const result = await client.query(`
                    UPDATE onstrument.price_history 
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

                if (result.rows.length === 0) {
                    await client.query(`
                        INSERT INTO onstrument.price_history (
                            time,
                            mint_address,
                            open,
                            high,
                            low,
                            close,
                            volume,
                            market_cap,
                            is_buy,
                            trade_count,
                            buy_count,
                            sell_count
                        ) VALUES (
                            $1,
                            $2,
                            $3,
                            $3,
                            $3,
                            $3,
                            $4,
                            $5,
                            $6,
                            1,
                            CASE WHEN $6 THEN 1 ELSE 0 END,
                            CASE WHEN $6 THEN 0 ELSE 1 END
                        )
                    `, [currentMinute, mintAddress, price, volume, marketCap, isBuy]);
                }

                // Update the tokens table with the latest price and market cap
                await client.query(`
                    UPDATE onstrument.tokens
                    SET 
                        current_price = $2,
                        market_cap_usd = $3,
                        last_price_update = $4
                    WHERE mint_address = $1
                `, [mintAddress, price, marketCap, timestamp]);

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
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
                FROM onstrument.price_history
                WHERE mint_address = $1
                ORDER BY time ASC
            `;

            const params = [tokenMintAddress];
            const result = await pool().query(query, params);

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
                    FROM onstrument.price_history_1m
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '5 minutes'
                `,
                '30m': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history_1m
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '30 minutes'
                `,
                '1h': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '1 hour'
                `,
                '4h': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '4 hours'
                `,
                '12h': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history_1h
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '12 hours'
                `,
                '24h': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history_1d
                    WHERE mint_address = $1 
                    AND bucket > NOW() - INTERVAL '24 hours'
                `,
                'all': `
                    SELECT SUM(volume) as total_volume
                    FROM onstrument.price_history
                    WHERE mint_address = $1
                `
            }[period];

            const result = await pool().query(query, [mintAddress]);
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
                    close as price,
                    close as price_usd,
                    market_cap
                FROM onstrument.price_history
                WHERE mint_address = $1
                ORDER BY time DESC
                LIMIT 1
            `;

            const result = await pool().query(query, [tokenMintAddress]);

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
