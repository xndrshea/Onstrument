import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

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

// Simple connection test
pool.query('SELECT NOW()', (err) => {
    if (err) {
        logger.error('Database connection failed:', err)
        process.exit(1)
    }
    logger.info('Database connected successfully')
})

export async function initializeDatabase() {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // Create schema if it doesn't exist
        await client.query(`CREATE SCHEMA IF NOT EXISTS token_platform`)

        // Create tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.custom_tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                curve_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER DEFAULT 9,
                description TEXT,
                metadata_url TEXT,
                curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER NOT NULL,
                metadata_url TEXT,
                image_url TEXT,
                verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.price_history (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL,
                time BIGINT NOT NULL,
                price NUMERIC(40, 18) NOT NULL,
                open NUMERIC(40, 18) NOT NULL,
                high NUMERIC(40, 18) NOT NULL,
                low NUMERIC(40, 18) NOT NULL,
                close NUMERIC(40, 18) NOT NULL,
                volume NUMERIC(40, 18) DEFAULT 0,
                CONSTRAINT unique_token_time UNIQUE (mint_address, time)
            )
        `)

        // Add new trades table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.trades (
                id SERIAL PRIMARY KEY,
                signature TEXT NOT NULL,
                token_address TEXT NOT NULL,
                token_type TEXT NOT NULL,
                wallet_address TEXT NOT NULL,
                side TEXT NOT NULL,
                amount DECIMAL NOT NULL,
                total DECIMAL NOT NULL,
                price DECIMAL NOT NULL,
                slot BIGINT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(signature)
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON token_platform.tokens(symbol);
            CREATE INDEX IF NOT EXISTS idx_tokens_verified ON token_platform.tokens(verified);
            CREATE INDEX IF NOT EXISTS idx_price_history_mint_time ON token_platform.price_history(mint_address, time DESC);
            CREATE INDEX IF NOT EXISTS idx_price_history_time ON token_platform.price_history(time DESC);
            CREATE INDEX IF NOT EXISTS idx_trades_token_address ON token_platform.trades(token_address);
            CREATE INDEX IF NOT EXISTS idx_trades_created_at ON token_platform.trades(created_at DESC)
        `)

        await client.query('COMMIT')
        logger.info('Database initialized successfully')
        return true

    } catch (error) {
        await client.query('ROLLBACK')
        logger.error('Failed to initialize database:', error)
        throw error
    } finally {
        client.release()
    }
}