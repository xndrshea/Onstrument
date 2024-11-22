import { pool } from '../config/database';
import { logger } from '../utils/logger';

async function init() {
    try {
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Error initializing database:', error);
        throw error;
    } finally {
        // Close the pool after initialization
        await pool.end();
        process.exit(0);
    }
}

init().catch(error => {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
}); 