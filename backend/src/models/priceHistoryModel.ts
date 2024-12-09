import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceHistoryModel {
    // This function runs after every trade to save the new price
    static async recordPrice(
        tokenMintAddress: string,  // Which token?
        price: number,             // What's the new price?
    ) {
        try {
            const currentTimestamp = Math.floor(Date.now() / 1000);

            // Add check for existing price at this timestamp
            const existingPrice = await pool.query(`
                SELECT price FROM token_platform.price_history 
                WHERE token_mint_address = $1 
                AND timestamp = to_timestamp($2)
            `, [tokenMintAddress, currentTimestamp]);

            // Only insert if price changed or no price exists
            if (existingPrice.rows.length === 0 || existingPrice.rows[0].price !== price) {
                logger.info(`Recording new price for ${tokenMintAddress}: ${price} SOL`);
                await pool.query(`
                    INSERT INTO token_platform.price_history 
                    (token_mint_address, price, timestamp)
                    VALUES ($1, $2, to_timestamp($3))
                `, [
                    tokenMintAddress,
                    price,
                    currentTimestamp
                ]);
            } else {
                logger.info(`Skipping price record for ${tokenMintAddress} - no change`);
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
                    EXTRACT(EPOCH FROM timestamp)::integer as timestamp,
                    price
                FROM token_platform.price_history
                WHERE token_mint_address = $1
                ORDER BY timestamp ASC
            `, [tokenMintAddress]);

            return result.rows;
        } catch (error) {
            logger.error('Error fetching price history:', error);
            throw error;
        }
    }
}
