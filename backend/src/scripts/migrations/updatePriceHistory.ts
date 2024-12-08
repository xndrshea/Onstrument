import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

async function updatePriceHistorySchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Modify total_supply to allow NULL values
        await client.query(`
            ALTER TABLE token_platform.price_history 
            ALTER COLUMN total_supply DROP NOT NULL;
        `);

        await client.query('COMMIT');
        logger.info('Successfully updated price_history schema');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error updating price_history schema:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Add this to run the script directly
if (require.main === module) {
    updatePriceHistorySchema()
        .then(() => {
            logger.info('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
} 