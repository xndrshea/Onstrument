import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'
import { initDatabase } from '../scripts/initDb'

dotenv.config()

const config = {
    user: process.env.DB_USER || 'alexandershea',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'token_platform',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
}

logger.info('Database configuration:', {
    user: config.user,
    host: config.host,
    database: config.database,
    port: config.port
})

export const pool = new Pool(config)

pool.on('error', (err) => {
    logger.error('Unexpected database error:', err)
    process.exit(-1)
})

export async function initializeDatabase() {
    try {
        const client = await pool.connect()
        logger.info('Attempting database connection...')

        // Check if ANY required table is missing
        const tablesExist = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'tokens'
            ) AS tokens_exist;
        `)

        if (!tablesExist.rows[0].tokens_exist) {
            logger.info('Required tables missing, running initialization...')
            await initDatabase()
            return true
        }

        logger.info('All required tables exist, skipping initialization')
        return true
    } catch (error: any) {
        logger.error('Database initialization error:', error)
        return false
    }
}

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        logger.error('Database connection failed:', err)
    } else {
        logger.info('Database connected successfully')
    }
})