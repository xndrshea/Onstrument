import { pool } from '../config/database';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

async function runMigration() {
    const client = await pool.connect();

    try {
        // Read migration file
        const migrationSQL = readFileSync(
            join(__dirname, '../migrations/20240323_add_bonding_curve_config.sql'),
            'utf8'
        );

        // Run migration
        await client.query('BEGIN');

        logger.info('Starting bonding curve config migration...');
        await client.query(migrationSQL);

        await client.query('COMMIT');
        logger.info('Migration completed successfully');

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
runMigration()
    .then(() => {
        logger.info('Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Migration script failed:', error);
        process.exit(1);
    }); 