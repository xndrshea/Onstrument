import { pool } from '../config/database';
import { logger } from '../utils/logger';

async function migrateDatabase() {
    const client = await pool.connect();
    try {
        logger.info('Starting database migration...');

        // Start transaction
        await client.query('BEGIN');

        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `);

        // Create or update tokens table
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
                token_type VARCHAR(20) DEFAULT 'bonding_curve',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Add indexes
            CREATE INDEX IF NOT EXISTS idx_tokens_mint_address ON token_platform.tokens(mint_address);
            CREATE INDEX IF NOT EXISTS idx_tokens_token_type ON token_platform.tokens(token_type);
        `);

        // Create or update token_stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.token_stats (
                token_id INTEGER PRIMARY KEY REFERENCES token_platform.tokens(id),
                price DECIMAL(30, 9),
                volume_24h DECIMAL(30, 9),
                liquidity DECIMAL(30, 9),
                holder_count INTEGER,
                transaction_count INTEGER,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create or update price_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.price_history (
                id SERIAL PRIMARY KEY,
                token_mint_address VARCHAR(255) NOT NULL,
                price DECIMAL(20, 9) NOT NULL,
                total_supply DECIMAL(20, 9),
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                source VARCHAR(10) DEFAULT 'dex',
                FOREIGN KEY (token_mint_address) REFERENCES token_platform.tokens(mint_address)
            );

            -- Add index for price history queries
            CREATE INDEX IF NOT EXISTS idx_price_history_token_time 
            ON token_platform.price_history(token_mint_address, timestamp);
        `);

        // Commit transaction
        await client.query('COMMIT');

        logger.info('Database migration completed successfully');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Database migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migrateDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { migrateDatabase }; 