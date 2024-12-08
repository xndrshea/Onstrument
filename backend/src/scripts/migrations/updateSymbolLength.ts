import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

async function updateSymbolLength() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Increase symbol column length to 32 characters
        await client.query(`
            ALTER TABLE token_platform.tokens 
            ALTER COLUMN symbol TYPE VARCHAR(32);
        `);

        await client.query('COMMIT');
        logger.info('Successfully updated symbol column length');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error updating symbol column length:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    updateSymbolLength()
        .then(() => {
            logger.info('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
} 