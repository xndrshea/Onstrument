import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { parameterStore } from '../config/parameterStore'

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        if (!parameterStore.isInitialized()) {
            throw new Error('Attempted to access database before parameter store initialization');
        }

        logger.info('Creating database pool...');
        pool = new Pool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            port: parseInt(process.env.DB_PORT || '5432'),
            ssl: process.env.NODE_ENV === 'production' ? {
                rejectUnauthorized: true
            } : false,
            max: 20,
            min: 4,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
        });

        pool.on('error', (err) => {
            logger.error('Unexpected error on idle client', err)
        });

        logger.info('Initializing database connection with:', {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER
        });
    }
    return pool;
}

export async function checkDatabaseSetup() {
    try {
        const dbPool = getPool();
        const result = await dbPool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'onstrument' 
                AND table_name = 'tokens'
            );
        `);

        if (!result.rows[0].exists) {
            logger.warn('Database tables not found. Running initialization...')
            const { initializeDatabase } = require('../scripts/initDb')
            await initializeDatabase()
            logger.info('Database initialization complete')
        } else {
            logger.info('Database tables verified')
        }
    } catch (error) {
        logger.error('Failed to check/initialize database:', error)
        throw error
    }
}

// Export the getter function test
export { getPool as pool }