import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { CurveType } from '../../../shared/types/token';

async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop existing schemas
        await client.query('DROP SCHEMA IF EXISTS token_platform CASCADE;');
        await client.query('DROP SCHEMA IF EXISTS token_launchpad CASCADE;');

        // Create fresh schema
        await client.query('CREATE SCHEMA token_platform;');

        // Create users table
        await client.query(`
            CREATE TABLE token_platform.users (
                id SERIAL PRIMARY KEY,
                wallet_address TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create tokens table
        await client.query(`
            CREATE TABLE token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                description TEXT,
                total_supply BIGINT NOT NULL,
                creator_id INTEGER REFERENCES token_platform.users(id),
                metadata JSONB NOT NULL,
                bonding_curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_metadata CHECK (
                    metadata ? 'bondingCurveATA' AND
                    metadata ? 'bondingCurveAddress'
                ),
                CONSTRAINT valid_bonding_curve_config CHECK (
                    (bonding_curve_config->>'curveType' IN ('linear', 'exponential', 'logarithmic')) AND
                    (bonding_curve_config->>'basePrice' IS NOT NULL) AND
                    (
                        (bonding_curve_config->>'curveType' = 'linear' AND bonding_curve_config->>'slope' IS NOT NULL) OR
                        (bonding_curve_config->>'curveType' = 'exponential' AND bonding_curve_config->>'exponent' IS NOT NULL) OR
                        (bonding_curve_config->>'curveType' = 'logarithmic' AND bonding_curve_config->>'logBase' IS NOT NULL)
                    )
                )
            );
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX idx_tokens_mint_address ON token_platform.tokens(mint_address);
            CREATE INDEX idx_tokens_creator_id ON token_platform.tokens(creator_id);
            CREATE INDEX idx_users_wallet_address ON token_platform.users(wallet_address);
        `);

        await client.query('COMMIT');
        logger.info('Database initialized successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

if (require.main === module) {
    initDatabase()
        .catch(error => {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        });
}

export { initDatabase };