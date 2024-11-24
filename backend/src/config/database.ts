import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

const config = {
    user: process.env.DB_USER || 'alexandershea',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'token_launchpad',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
}

export const pool = new Pool(config)

pool.on('error', (err) => {
    logger.error('Unexpected database error:', err)
})

export async function initializeDatabase() {
    try {
        const client = await pool.connect()
        await client.query('SELECT NOW()')
        logger.info('Database connected successfully')
        client.release()
        return true
    } catch (error) {
        logger.error('Database connection failed:', error)
        return false
    }
} 