import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

const config = {
    user: process.env.DB_USER || 'alexandershea',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'token_platform',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
}

logger.info('Database configuration:', {
    user: config.user,
    host: config.host,
    database: config.database,
    port: config.port
})

export const pool = new Pool(config)

// Simple connection test
pool.query('SELECT NOW()', (err) => {
    if (err) {
        logger.error('Database connection failed:', err)
        process.exit(1)
    }
    logger.info('Database connected successfully')
})

export async function initializeDatabase() {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query('CREATE SCHEMA IF NOT EXISTS token_platform')
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE')
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

        // Consolidated tokens table creation
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                symbol VARCHAR(20),
                decimals INTEGER DEFAULT 6,
                token_type VARCHAR(10) NOT NULL,
                description TEXT,
                website_url TEXT,
                docs_url TEXT,
                twitter_url TEXT,
                telegram_url TEXT,
                metadata_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                curve_address VARCHAR(255),
                curve_config JSONB,
                interface VARCHAR(50),
                content JSONB,
                authorities JSONB,
                compression JSONB,
                grouping JSONB,
                royalty JSONB,
                creators JSONB,
                ownership JSONB,
                supply JSONB,
                mutable BOOLEAN,
                burnt BOOLEAN,
                token_info JSONB,
                verified BOOLEAN DEFAULT FALSE,
                image_url TEXT,
                attributes JSONB,
                price_sol NUMERIC(78,36),
                off_chain_metadata JSONB,
                metadata_status VARCHAR(50),
                metadata_source VARCHAR(50),
                metadata_fetch_attempts INTEGER DEFAULT 0,
                last_metadata_fetch TIMESTAMP WITH TIME ZONE,
                market_cap NUMERIC(78,36),
                token_vault VARCHAR(255),
                market_cap_usd NUMERIC(78,36),
                fully_diluted_value_usd NUMERIC(78,36),
                price_change_5m NUMERIC(78,36),
                price_change_1h NUMERIC(78,36),
                price_change_6h NUMERIC(78,36),
                price_change_24h NUMERIC(78,36),
                price_change_7d NUMERIC(78,36),
                price_change_30d NUMERIC(78,36),
                token_source VARCHAR(20) NOT NULL DEFAULT 'custom',
                last_price_update TIMESTAMP WITH TIME ZONE,
                current_price NUMERIC(78,36),
                volume_5m NUMERIC(78,36) DEFAULT 0,
                volume_1h NUMERIC(78,36) DEFAULT 0,
                volume_6h NUMERIC(78,36) DEFAULT 0,
                volume_24h NUMERIC(78,36) DEFAULT 0,
                volume_7d NUMERIC(78,36) DEFAULT 0,
                volume_30d NUMERIC(78,36) DEFAULT 0,
                apr_24h NUMERIC(78,36) DEFAULT 0,
                apr_7d NUMERIC(78,36) DEFAULT 0,
                apr_30d NUMERIC(78,36) DEFAULT 0,
                tvl NUMERIC(78,36),
                price_sources JSONB DEFAULT '[]'::jsonb,
                sol_price_sources JSONB DEFAULT '[]'::jsonb,
                -- Transaction metrics
                tx_5m_buys INTEGER DEFAULT 0,
                tx_5m_sells INTEGER DEFAULT 0,
                tx_5m_buyers INTEGER DEFAULT 0,
                tx_5m_sellers INTEGER DEFAULT 0,
                tx_1h_buys INTEGER DEFAULT 0,
                tx_1h_sells INTEGER DEFAULT 0,
                tx_1h_buyers INTEGER DEFAULT 0,
                tx_1h_sellers INTEGER DEFAULT 0,
                tx_6h_buys INTEGER DEFAULT 0,
                tx_6h_sells INTEGER DEFAULT 0,
                tx_6h_buyers INTEGER DEFAULT 0,
                tx_6h_sellers INTEGER DEFAULT 0,
                tx_24h_buys INTEGER DEFAULT 0,
                tx_24h_sells INTEGER DEFAULT 0,
                tx_24h_buyers INTEGER DEFAULT 0,
                tx_24h_sellers INTEGER DEFAULT 0,
                reserve_in_usd NUMERIC(78,36),
                base_token_price_native_currency NUMERIC(78,36),
                quote_token_price_native_currency NUMERIC(78,36),
                CONSTRAINT valid_token_type CHECK (token_type IN ('custom', 'dex')),
                CONSTRAINT valid_token_source CHECK (token_source IN ('custom', 'raydium', 'geckoterminal'))
            );

            CREATE INDEX IF NOT EXISTS idx_tokens_type ON token_platform.tokens(token_type);
            CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON token_platform.tokens(symbol);
            CREATE INDEX IF NOT EXISTS idx_tokens_verified ON token_platform.tokens(verified);
            CREATE INDEX IF NOT EXISTS idx_tokens_metadata_status ON token_platform.tokens(metadata_status);
            CREATE INDEX IF NOT EXISTS idx_tokens_token_vault ON token_platform.tokens(token_vault);
            CREATE INDEX IF NOT EXISTS idx_tokens_source ON token_platform.tokens(token_source);
        `);

        // Create indexes after table creation
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tokens_type ON token_platform.tokens(token_type);
            CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON token_platform.tokens(symbol);
            CREATE INDEX IF NOT EXISTS idx_tokens_verified ON token_platform.tokens(verified);
            CREATE INDEX IF NOT EXISTS idx_tokens_metadata_status ON token_platform.tokens(metadata_status);
        `);

        // Create price_history table first
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.price_history (
                time TIMESTAMPTZ NOT NULL,
                mint_address VARCHAR(255) NOT NULL,
                price NUMERIC(78,36) NOT NULL,
                open NUMERIC(78,36) NOT NULL,
                high NUMERIC(78,36) NOT NULL,
                low NUMERIC(78,36) NOT NULL,
                close NUMERIC(78,36) NOT NULL,
                volume NUMERIC(78,36) DEFAULT 0,
                market_cap NUMERIC(78,36) DEFAULT 0,
                CONSTRAINT price_history_pkey PRIMARY KEY (mint_address, time)
            )
        `)

        // Then convert to hypertable
        await client.query(`
            SELECT create_hypertable(
                'token_platform.price_history',
                'time',
                partitioning_column => 'mint_address',
                number_partitions => 4,
                chunk_time_interval => INTERVAL '1 day',
                if_not_exists => TRUE
            )
        `)

        // Add compression policy
        await client.query(`
            ALTER TABLE token_platform.price_history SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'mint_address'
            );

            SELECT add_compression_policy('token_platform.price_history',
                compress_after => INTERVAL '7 days',
                if_not_exists => TRUE);
        `)

        // Create trades as a hypertable
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.trades (
                time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                signature TEXT NOT NULL,
                token_address TEXT NOT NULL,
                token_type TEXT NOT NULL,
                wallet_address TEXT NOT NULL,
                side TEXT NOT NULL,
                amount NUMERIC(78,36) NOT NULL,
                total NUMERIC(78,36) NOT NULL,
                price NUMERIC(78,36) NOT NULL,
                slot BIGINT NOT NULL,
                PRIMARY KEY (time, signature)
            )
        `)

        // Convert to hypertable
        await client.query(`
            SELECT create_hypertable(
                'token_platform.trades',
                'time',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
        `)

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_price_history_mint_time 
            ON token_platform.price_history (mint_address, time DESC);
            
            CREATE INDEX IF NOT EXISTS idx_trades_token_time 
            ON token_platform.trades (token_address, time DESC);
        `)

        // Add users table without touching anything else
        await client.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS token_platform.users (
                user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                wallet_address TEXT UNIQUE NOT NULL,
                is_subscribed BOOLEAN DEFAULT false,
                subscription_expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_users_wallet ON token_platform.users(wallet_address);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.user_trading_stats (
                user_id UUID REFERENCES token_platform.users(user_id),
                mint_address VARCHAR(255) REFERENCES token_platform.tokens(mint_address),
                total_trades INTEGER DEFAULT 0,
                total_volume NUMERIC(78,36) DEFAULT 0,
                total_buy_volume NUMERIC(78,36) DEFAULT 0,
                total_sell_volume NUMERIC(78,36) DEFAULT 0,
                first_trade_at TIMESTAMP WITH TIME ZONE,
                last_trade_at TIMESTAMP WITH TIME ZONE,
                PRIMARY KEY (user_id, mint_address)
            );

            CREATE INDEX IF NOT EXISTS idx_user_trading_stats_user 
            ON token_platform.user_trading_stats(user_id);
            
            CREATE INDEX IF NOT EXISTS idx_user_trading_stats_mint 
            ON token_platform.user_trading_stats(mint_address);
        `);

        await client.query(`
            ALTER TABLE token_platform.tokens
            ADD COLUMN IF NOT EXISTS website_url TEXT,
            ADD COLUMN IF NOT EXISTS docs_url TEXT,
            ADD COLUMN IF NOT EXISTS twitter_url TEXT,
            ADD COLUMN IF NOT EXISTS telegram_url TEXT;
        `);

        await client.query('COMMIT')

        // Part 2: Create continuous aggregates outside transaction
        // Create continuous aggregates for different time intervals
        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS token_platform.price_history_1m
            WITH (timescaledb.continuous) AS
            SELECT 
                time_bucket('1 minute', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume
            FROM token_platform.price_history
            GROUP BY bucket, mint_address;
        `);

        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS token_platform.price_history_1h
            WITH (timescaledb.continuous) AS
            SELECT 
                time_bucket('1 hour', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume
            FROM token_platform.price_history
            GROUP BY bucket, mint_address;
        `);

        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS token_platform.price_history_1d
            WITH (timescaledb.continuous) AS
            SELECT 
                time_bucket('1 day', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume
            FROM token_platform.price_history
            GROUP BY bucket, mint_address;
        `);

        // Add refresh policies outside transaction
        await client.query(`
            SELECT add_continuous_aggregate_policy('token_platform.price_history_1m',
                start_offset => INTERVAL '1 hour',
                end_offset => INTERVAL '1 minute',
                schedule_interval => INTERVAL '1 minute',
                if_not_exists => TRUE);

            SELECT add_continuous_aggregate_policy('token_platform.price_history_1h',
                start_offset => INTERVAL '1 day',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists => TRUE);

            SELECT add_continuous_aggregate_policy('token_platform.price_history_1d',
                start_offset => INTERVAL '7 days',
                end_offset => INTERVAL '1 day',
                schedule_interval => INTERVAL '1 day',
                if_not_exists => TRUE);
        `);
        logger.info('Database initialized successfully')
        return true

    } catch (error) {
        await client.query('ROLLBACK')
        logger.error('Failed to initialize database:', error)
        throw error
    } finally {
        client.release()
    }
}