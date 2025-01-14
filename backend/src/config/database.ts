import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

// Load environment-specific config
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local'
dotenv.config({ path: envFile })

// Create connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '5432'),
    max: 20,
    min: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
})

// Handle pool errors
pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err)
})

// Check if database is initialized
export async function checkDatabaseSetup() {
    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'onstrument' 
                AND table_name = 'tokens'
            );
        `)

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
        process.exit(1)
    }
}

// Export pool for use in other files
export { pool }