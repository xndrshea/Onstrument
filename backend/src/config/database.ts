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

        // Check for all required tables
        const tablesExist = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'raydium_tokens'
            ) AS raydium_tokens_exist,
            EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'custom_tokens'
            ) AS custom_tokens_exist,
            EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'price_history'
            ) AS price_history_exist,
            EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'trade_history'
            ) AS trade_history_exist,
            EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_platform' 
                AND table_name = 'token_stats'
            ) AS token_stats_exist;
        `)

        const allTablesExist = Object.values(tablesExist.rows[0]).every(exists => exists);

        if (!allTablesExist) {
            logger.info('Some tables missing, starting initialization...')
            await initDatabase()
        } else {
            logger.info('All database tables exist, skipping initialization')
        }

        client.release()
        return true
    } catch (error: any) {
        logger.error('Database initialization error:', {
            error: error.message,
            code: error.code,
            detail: error.detail
        })
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