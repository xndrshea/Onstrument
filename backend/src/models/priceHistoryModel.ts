import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceHistoryModel {
    // This function runs after every trade to save the new price
    static async recordPrice(
        tokenMintAddress: string,  // Which token?
        price: number,             // What's the new price?
        totalSupply: number        // What's the total supply after the trade?
    ) {
        try {
            // Insert a new row into our price_history table
            await pool.query(`
                INSERT INTO token_platform.price_history 
                (token_mint_address, price, total_supply, timestamp)
                VALUES ($1, $2, $3, $4)
            `, [
                tokenMintAddress,
                price,
                totalSupply,
                Math.floor(Date.now() / 1000) // Current time in seconds
            ]);
        } catch (error) {
            logger.error('Error recording price:', error);
            throw error;
        }
    }

    // This function gets called when loading the price chart
    static async getPriceHistory(tokenMintAddress: string) {
        try {
            // Get all price points for this token, ordered by time
            const result = await pool.query(`
                SELECT timestamp, price, total_supply
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
