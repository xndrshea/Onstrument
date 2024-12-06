import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `);

        // Create tokens table with the simplified curve_config
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
                curve_config JSONB NOT NULL DEFAULT '{"virtualSol": 0}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_token_platform_tokens_mint_address 
            ON token_platform.tokens(mint_address);

            COMMIT;
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

// Only run if this file is being executed directly
if (require.main === module) {
    initDatabase().catch(console.error);
}