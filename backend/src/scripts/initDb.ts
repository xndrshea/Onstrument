import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `);

        // Create tokens table with index in a single transaction
        await client.query(`
            BEGIN;
            
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(255) NOT NULL UNIQUE,
                curve_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                description TEXT,
                metadata_uri TEXT,
                total_supply NUMERIC NOT NULL,
                decimals INTEGER DEFAULT 9,
                curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes 
                    WHERE schemaname = 'token_platform' 
                    AND tablename = 'tokens' 
                    AND indexname = 'idx_token_platform_tokens_mint_address'
                ) THEN
                    CREATE INDEX idx_token_platform_tokens_mint_address 
                    ON token_platform.tokens(mint_address);
                END IF;
            END $$;

            COMMIT;
        `);

        logger.info('Database initialized successfully');
        return true;
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Only run if this file is being executed directly
if (require.main === module) {
    initDatabase().catch(console.error);
}