import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop existing tables if they exist
        await client.query(`
            DROP TABLE IF EXISTS 
                token_platform.raydium_tokens,
                token_platform.custom_tokens,
                token_platform.price_history,
                token_platform.trade_history,
                token_platform.token_stats CASCADE;
        `);

        // Create schema
        await client.query(`CREATE SCHEMA IF NOT EXISTS token_platform;`);

        // Raydium tokens table
        await client.query(`
            CREATE TABLE token_platform.raydium_tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL UNIQUE,
                pool_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER DEFAULT 9,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Custom tokens table with curve_config
        await client.query(`
            CREATE TABLE token_platform.custom_tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL UNIQUE,
                curve_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER DEFAULT 9,
                description TEXT,
                metadata_uri TEXT,
                curve_config JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Price history table (for both types)
        await client.query(`
            CREATE TABLE token_platform.price_history (
                mint_address TEXT NOT NULL,
                price DECIMAL NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (mint_address, timestamp)
            );
        `);

        // Trade history table
        await client.query(`
            CREATE TABLE token_platform.trade_history (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL,
                price DECIMAL(30, 9) NOT NULL,
                amount DECIMAL(30, 9) NOT NULL,
                side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
                wallet_address VARCHAR(255) NOT NULL,
                signature VARCHAR(255) NOT NULL UNIQUE,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                token_type VARCHAR(10) NOT NULL CHECK (token_type IN ('raydium', 'custom'))
            );
        `);

        // Token stats table
        await client.query(`
            CREATE TABLE token_platform.token_stats (
                mint_address VARCHAR(255) PRIMARY KEY,
                price DECIMAL(30, 9) NOT NULL,
                volume_24h DECIMAL(30, 9) NOT NULL DEFAULT 0,
                liquidity DECIMAL(30, 9),
                holder_count INTEGER,
                price_change_24h DECIMAL(10, 2),
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX idx_price_history_mint_time ON token_platform.price_history(mint_address, timestamp);
            CREATE INDEX idx_trade_history_mint_time ON token_platform.trade_history(mint_address, timestamp);
            CREATE INDEX idx_raydium_tokens_mint ON token_platform.raydium_tokens(mint_address);
            CREATE INDEX idx_custom_tokens_mint ON token_platform.custom_tokens(mint_address);
        `);

        await client.query('COMMIT');
        logger.info('Database initialized successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Failed to initialize database:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Add this to run the script directly
if (require.main === module) {
    initDatabase()
        .then(() => {
            logger.info('Database initialization completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        });
}