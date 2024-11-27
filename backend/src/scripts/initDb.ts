import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        logger.info('Creating schema...');
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_platform;
        `);

        logger.info('Creating network_type enum...');
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE network_type AS ENUM ('mainnet', 'devnet');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        logger.info('Creating tables...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.users (
                id SERIAL PRIMARY KEY,
                wallet_address VARCHAR(44) UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                id SERIAL PRIMARY KEY,
                mint_address VARCHAR(44) UNIQUE NOT NULL,
                curve_address VARCHAR(44) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                description TEXT,
                metadata_uri TEXT,
                total_supply NUMERIC(20) NOT NULL,
                decimals INTEGER NOT NULL DEFAULT 9,
                creator_id INTEGER REFERENCES token_platform.users(id),
                network network_type NOT NULL DEFAULT 'devnet',
                curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_symbol_length CHECK (length(symbol) <= 10),
                CONSTRAINT valid_total_supply CHECK (total_supply > 0),
                CONSTRAINT valid_decimals CHECK (decimals >= 0 AND decimals <= 9)
            );

            CREATE TABLE IF NOT EXISTS token_platform.token_stats (
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

            CREATE TABLE IF NOT EXISTS token_platform.trade_history (
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

        logger.info('Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tokens_mint_address ON token_platform.tokens(mint_address);
            CREATE INDEX IF NOT EXISTS idx_tokens_curve_address ON token_platform.tokens(curve_address);
            CREATE INDEX IF NOT EXISTS idx_tokens_creator_id ON token_platform.tokens(creator_id);
            CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON token_platform.users(wallet_address);
            CREATE INDEX IF NOT EXISTS idx_trade_history_token_id ON token_platform.trade_history(token_id);
            CREATE INDEX IF NOT EXISTS idx_trade_history_trader ON token_platform.trade_history(trader_address);
            CREATE INDEX IF NOT EXISTS idx_trade_history_timestamp ON token_platform.trade_history(timestamp);
        `);

        await client.query('COMMIT');
        logger.info('Database initialization completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error during database initialization:', error);
        throw error;
    } finally {
        client.release();
    }
}

if (require.main === module) {
    initDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Failed to initialize database:', error);
            process.exit(1);
        });
}