import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

// Use environment variables with fallbacks
const config = {
    user: process.env.DB_USER || 'alexandershea',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'token_platform',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5432')
};

const pool = new Pool(config);

// Log connection details (excluding sensitive info)
logger.info('Database config:', {
    database: config.database,
    host: config.host,
    port: config.port,
    user: config.user,
    password: '****' // Hide actual password
});

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err)
    process.exit(-1)
})

pool.on('connect', () => {
    logger.info('Database connection successful')
})

export { pool } 