import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `);

        // Create tokens table with all required columns
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL UNIQUE,
                curve_address VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                description TEXT,
                metadata_uri TEXT,
                total_supply NUMERIC,
                decimals INTEGER DEFAULT 9,
                curve_config JSONB DEFAULT '{"virtualSol": 0}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Add new columns if they don't exist
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE token_platform.tokens 
                    ADD COLUMN token_type VARCHAR(20) DEFAULT 'bonding_curve',
                    ADD COLUMN dex_pool_address VARCHAR(255),
                    ADD COLUMN volume_24h DECIMAL(20, 9),
                    ADD COLUMN liquidity DECIMAL(20, 9),
                    ADD COLUMN price_change_24h DECIMAL(10, 2);
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        NULL;
                END;
            END $$;

            CREATE TABLE IF NOT EXISTS token_platform.price_history (
                id SERIAL PRIMARY KEY,
                token_mint_address VARCHAR(255) NOT NULL,
                price DECIMAL(30, 9) NOT NULL,
                total_supply DECIMAL(30, 9) NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                source VARCHAR(20) NOT NULL DEFAULT 'dex',
                FOREIGN KEY (token_mint_address) REFERENCES token_platform.tokens(mint_address)
            );

            -- Add source column to price_history if it doesn't exist
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE token_platform.price_history 
                    ADD COLUMN source VARCHAR(20) NOT NULL;
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        NULL;
                END;
            END $$;

            -- Create indexes if they don't exist
            CREATE INDEX IF NOT EXISTS idx_tokens_mint_address ON token_platform.tokens(mint_address);
            CREATE INDEX IF NOT EXISTS idx_price_history_token_time ON token_platform.price_history(token_mint_address, timestamp);
        `);

        logger.info('Database initialized successfully');
        return true;
    } catch (error) {
        logger.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Add this to run the script directly
if (require.main === module) {
    initDatabase()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Failed to initialize database:', error);
            process.exit(1);
        });
}