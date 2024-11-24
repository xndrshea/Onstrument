import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { CurveType } from '../../../shared/types/token';

async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop existing schemas
        await client.query('DROP SCHEMA IF EXISTS token_platform CASCADE;');

        // Create fresh schema
        await client.query('CREATE SCHEMA token_platform;');

        // Create network type enum
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE network_type AS ENUM ('mainnet', 'devnet');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Create curve type enum matching the frontend/Rust definitions
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE token_platform.curve_type AS ENUM ('Linear', 'Exponential', 'Logarithmic');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Create users table
        await client.query(`
            CREATE TABLE token_platform.users (
                id SERIAL PRIMARY KEY,
                wallet_address VARCHAR(44) UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create tokens table with curve configuration
        await client.query(`
            CREATE TABLE token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(44) UNIQUE NOT NULL,
                curve_address VARCHAR(44) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                description TEXT,
                total_supply NUMERIC(20) NOT NULL,
                decimals INTEGER NOT NULL DEFAULT 9,
                creator_id INTEGER REFERENCES token_platform.users(id),
                network network_type NOT NULL DEFAULT 'devnet',
                curve_type token_platform.curve_type NOT NULL,
                base_price NUMERIC(20,9) NOT NULL,
                slope NUMERIC(20,9),
                exponent NUMERIC(20,9),
                log_base NUMERIC(20,9),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                CONSTRAINT valid_symbol_length CHECK (length(symbol) <= 10),
                CONSTRAINT valid_total_supply CHECK (total_supply > 0),
                CONSTRAINT valid_decimals CHECK (decimals >= 0 AND decimals <= 9),
                CONSTRAINT valid_base_price CHECK (base_price > 0),
                CONSTRAINT valid_curve_params CHECK (
                    (curve_type = 'Linear' AND slope IS NOT NULL) OR
                    (curve_type = 'Exponential' AND exponent IS NOT NULL) OR
                    (curve_type = 'Logarithmic' AND log_base IS NOT NULL)
                )
            );
        `);

        // Create token stats table
        await client.query(`
            CREATE TABLE token_platform.token_stats (
                token_id INTEGER PRIMARY KEY REFERENCES token_platform.tokens(id),
                holder_count INTEGER NOT NULL DEFAULT 0,
                transaction_count INTEGER NOT NULL DEFAULT 0,
                last_price NUMERIC(20,9),
                market_cap NUMERIC(20,2),
                volume_24h NUMERIC(20,2),
                total_volume NUMERIC(20,2) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_counts CHECK (
                    holder_count >= 0 
                    AND transaction_count >= 0
                )
            );
        `);

        // Create trade history table
        await client.query(`
            CREATE TABLE token_platform.trade_history (
                id SERIAL PRIMARY KEY,
                token_id INTEGER REFERENCES token_platform.tokens(id),
                trader_address VARCHAR(44) NOT NULL,
                transaction_signature VARCHAR(88) UNIQUE NOT NULL,
                amount NUMERIC(20,9) NOT NULL,
                price_per_token NUMERIC(20,9) NOT NULL,
                total_price NUMERIC(20,9) NOT NULL,
                price_impact NUMERIC(5,2) NOT NULL,
                is_buy BOOLEAN NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_amount CHECK (amount > 0),
                CONSTRAINT valid_prices CHECK (
                    price_per_token >= 0 AND
                    total_price >= 0 AND
                    price_impact >= -100 AND
                    price_impact <= 100
                )
            );
        `);

        // Create indexes for performance
        await client.query(`
            CREATE INDEX idx_tokens_mint_address ON token_platform.tokens(mint_address);
            CREATE INDEX idx_tokens_curve_address ON token_platform.tokens(curve_address);
            CREATE INDEX idx_tokens_creator_id ON token_platform.tokens(creator_id);
            CREATE INDEX idx_users_wallet_address ON token_platform.users(wallet_address);
            CREATE INDEX idx_trade_history_token_id ON token_platform.trade_history(token_id);
            CREATE INDEX idx_trade_history_trader ON token_platform.trade_history(trader_address);
            CREATE INDEX idx_trade_history_timestamp ON token_platform.trade_history(timestamp);
        `);

        await client.query('COMMIT');
        logger.info('Database initialized successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
}

export { initDatabase };