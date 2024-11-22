import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { readFileSync } from 'fs';
import { join } from 'path';

async function backupDatabase() {
    const client = await pool.connect();

    try {
        // Read backup SQL
        const backupSQL = readFileSync(
            join(__dirname, '../migrations/20240322_backup_tokens.sql'),
            'utf8'
        );

        logger.info('Starting database backup...');
        await client.query(backupSQL);
        logger.info('Backup completed successfully');

    } catch (error) {
        logger.error('Backup failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run backup
backupDatabase()
    .then(() => {
        logger.info('Backup script completed');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Backup script failed:', error);
        process.exit(1);
    }); 