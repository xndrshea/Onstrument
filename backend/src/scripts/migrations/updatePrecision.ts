import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

async function updatePrecision() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update token_stats table
        await client.query(`
            ALTER TABLE token_platform.token_stats 
            ALTER COLUMN price TYPE DECIMAL(30,9),
            ALTER COLUMN volume_24h TYPE DECIMAL(30,9),
            ALTER COLUMN liquidity TYPE DECIMAL(30,9);
        `);

        // Update price_history table
        await client.query(`
            ALTER TABLE token_platform.price_history 
            ALTER COLUMN price TYPE DECIMAL(30,9),
            ALTER COLUMN total_supply TYPE DECIMAL(30,9);
        `);

        await client.query('COMMIT');
        logger.info('Successfully updated decimal precision for token tables');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error updating decimal precision:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    updatePrecision()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { updatePrecision }; 