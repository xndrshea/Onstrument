import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

async function addSourceColumn() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if column exists
        const columnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'token_platform' 
            AND table_name = 'price_history' 
            AND column_name = 'source';
        `);

        if (columnExists.rows.length === 0) {
            // Add the column if it doesn't exist
            await client.query(`
                ALTER TABLE token_platform.price_history
                ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'bonding_curve';
            `);
            logger.info('Successfully added source column to price_history table');
        } else {
            logger.info('Source column already exists in price_history table');
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error adding source column:', error);
        throw error;
    } finally {
        
        client.release();
    }
}

// Run the migration if this file is executed directly
if (require.main === module) {
    addSourceColumn()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { addSourceColumn };
