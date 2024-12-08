import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

export async function updateTokensTable() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Modify total_supply to allow NULL values
        await client.query(`
            ALTER TABLE token_platform.tokens 
            ALTER COLUMN total_supply DROP NOT NULL;
        `);

        await client.query('COMMIT');
        logger.info('Successfully updated tokens table schema');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error updating tokens table:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Add this to run the script directly
if (require.main === module) {
    updateTokensTable()
        .then(() => {
            logger.info('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
} 