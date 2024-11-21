import { Pool } from 'pg'
import { logger } from '../utils/logger'

// Log the database config (without password) for debugging
logger.info('Database config:', {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'token_launchpad',
    port: Number(process.env.DB_PORT)
})

export const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'token_launchpad',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT)
})

pool.on('connect', () => {
    logger.info('Database connection successful')
})

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err)
    process.exit(-1)
})

export async function initializeDatabase() {
    const client = await pool.connect()
    try {
        // Drop existing tables if they exist (for clean initialization)
        await client.query(`
            DROP SCHEMA IF EXISTS token_platform CASCADE;
        `)

        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `)

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.users (
                id SERIAL PRIMARY KEY,
                wallet_address TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `)

        // Create tokens table with bonding_curve_config column
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                description TEXT,
                creator_id INTEGER REFERENCES token_platform.users(id),
                total_supply NUMERIC NOT NULL DEFAULT 0,
                image_url TEXT,
                network TEXT DEFAULT 'devnet',
                metadata JSONB,
                bonding_curve_config JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `)

        logger.info('Database initialized successfully')
    } catch (error) {
        logger.error('Error initializing database:', error)
        throw error
    } finally {
        client.release()
    }
} 