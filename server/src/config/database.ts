import { Pool } from 'pg'
import { logger } from '../utils/logger'

const pool = new Pool({
    user: 'alexandershea',
    host: 'localhost',
    database: 'token_launchpad',
    password: '',
    port: 5432,
})

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