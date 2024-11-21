import { Pool, PoolConfig } from 'pg'
import { logger } from '../utils/logger'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: 'server/.env' })

const config: PoolConfig = {
    user: process.env.DB_USER || 'alexandershea',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'token_launchpad',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5432'),
}

logger.info('Database config:', { ...config, password: '****' })

const pool = new Pool(config)

export async function initializeDatabase() {
    try {
        const client = await pool.connect()
        await client.query('SELECT NOW()')
        logger.info('Database connection successful')
        client.release()
    } catch (error) {
        logger.error('Database connection failed:', error)
        throw error
    }
}

export { pool } 