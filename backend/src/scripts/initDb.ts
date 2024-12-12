import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop everything for a clean slate
        await client.query(`DROP SCHEMA IF EXISTS token_platform CASCADE;`);
        await client.query(`CREATE SCHEMA token_platform;`);

        // Custom tokens with bonding curves
        await client.query(`
            CREATE TABLE token_platform.custom_tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                curve_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER DEFAULT 9,
                description TEXT,
                metadata_url TEXT,
                curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Token metadata table (for DEX tokens)
        await client.query(`
            CREATE TABLE token_platform.tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER NOT NULL,
                metadata_url TEXT,
                image_url TEXT,
                verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Price history (for both DEX and custom tokens)
        await client.query(`
            CREATE TABLE token_platform.price_history (
                id SERIAL PRIMARY KEY,
                token_address VARCHAR(255) NOT NULL,
                time BIGINT NOT NULL,           -- Unix timestamp in seconds
                price NUMERIC(40, 18) NOT NULL,  -- Current price
                open NUMERIC(40, 18) NOT NULL,   -- Opening price for the period
                high NUMERIC(40, 18) NOT NULL,   -- Highest price in period
                low NUMERIC(40, 18) NOT NULL,    -- Lowest price in period
                close NUMERIC(40, 18) NOT NULL,  -- Closing price (same as current price)
                volume NUMERIC(40, 18) DEFAULT 0,
                CONSTRAINT unique_token_time UNIQUE (token_address, time)
            );
        `);

        // Trade history (for both DEX and custom tokens)
        await client.query(`
            CREATE TABLE token_platform.trades (
                signature VARCHAR(255) PRIMARY KEY,
                token_address VARCHAR(255) NOT NULL,
                token_type VARCHAR(10) NOT NULL CHECK (token_type IN ('pool', 'custom')),
                wallet_address VARCHAR(255) NOT NULL,
                side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
                amount DECIMAL(30, 9) NOT NULL,
                total DECIMAL(30, 9) NOT NULL,
                price DECIMAL(30, 9) NOT NULL,
                slot BIGINT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX idx_pools_base_mint ON token_platform.pools(base_mint);
            CREATE INDEX idx_pools_quote_mint ON token_platform.pools(quote_mint);
            CREATE INDEX idx_price_history_token ON token_platform.price_history(token_address, time);
            CREATE INDEX idx_trades_token ON token_platform.trades(token_address, timestamp);
        `);

        await client.query('COMMIT');
        logger.info('Database initialized successfully with Helius schema and custom token support');
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