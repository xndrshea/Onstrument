import { Client } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'
import { verifyEnvironmentVariables } from '../utils/configCheck'

console.log('Env file:', process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local');
console.log('DB Config:', {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    // Check if password exists (don't log it)
    hasPassword: !!process.env.DB_PASSWORD
});

export async function initializeDatabase() {
    // Load environment variables
    const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local'
    dotenv.config({ path: envFile })

    // Verify environment variables
    if (!verifyEnvironmentVariables()) {
        process.exit(1)
    }

    const password = encodeURIComponent(process.env.DB_PASSWORD || '');
    const host = 'krr5hnzkou.dt2nm2kjqv.tsdb.cloud.timescale.com';
    const connectionString = `postgres://tsdbadmin:${password}@${host}:31509/tsdb?sslmode=require`;

    const client = new Client({
        connectionString,
        ssl: {
            rejectUnauthorized: true
        }
    });

    // Debug (safe to show encoded URL)
    console.log('Using connection string:', connectionString);

    // Add debug
    console.log('Password type:', typeof process.env.DB_PASSWORD);
    console.log('Password length:', process.env.DB_PASSWORD?.length);

    console.log('Raw password:', process.env.DB_PASSWORD);
    console.log('Password chars:', process.env.DB_PASSWORD?.split('').map(c => c.charCodeAt(0)));

    try {
        await client.connect()
        console.log('Connected to database')

        await client.query('BEGIN')
        console.log('Started transaction')

        // First transaction: Create schema, extensions, and base tables
        await client.query('CREATE SCHEMA IF NOT EXISTS onstrument')
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE')
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

        // Create tokens table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onstrument.tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                symbol VARCHAR(20),
                decimals INTEGER,
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

            CREATE INDEX IF NOT EXISTS idx_tokens_type ON onstrument.tokens(token_type);
            CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON onstrument.tokens(symbol);
            CREATE INDEX IF NOT EXISTS idx_tokens_verified ON onstrument.tokens(verified);
            CREATE INDEX IF NOT EXISTS idx_tokens_metadata_status ON onstrument.tokens(metadata_status);
            CREATE INDEX IF NOT EXISTS idx_tokens_token_vault ON onstrument.tokens(token_vault);
            CREATE INDEX IF NOT EXISTS idx_tokens_source ON onstrument.tokens(token_source);
        `);

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onstrument.users (
                user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                wallet_address TEXT UNIQUE NOT NULL,
                is_subscribed BOOLEAN DEFAULT false,
                subscription_expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_users_wallet ON onstrument.users(wallet_address);
        `);

        // Create user_trading_stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onstrument.user_trading_stats (
                user_id UUID REFERENCES onstrument.users(user_id),
                mint_address VARCHAR(255) REFERENCES onstrument.tokens(mint_address),
                total_trades INTEGER DEFAULT 0,
                total_volume NUMERIC(78,36) DEFAULT 0,
                total_buy_volume NUMERIC(78,36) DEFAULT 0,
                total_sell_volume NUMERIC(78,36) DEFAULT 0,
                first_trade_at TIMESTAMP WITH TIME ZONE,
                last_trade_at TIMESTAMP WITH TIME ZONE,
                PRIMARY KEY (user_id, mint_address)
            );

            CREATE INDEX IF NOT EXISTS idx_user_trading_stats_user ON onstrument.user_trading_stats(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_trading_stats_mint ON onstrument.user_trading_stats(mint_address);
        `);

        // Create price_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onstrument.price_history (
                time TIMESTAMPTZ NOT NULL,
                mint_address VARCHAR(255) NOT NULL,
                open NUMERIC(78,36) NOT NULL,
                high NUMERIC(78,36) NOT NULL,
                low NUMERIC(78,36) NOT NULL,
                close NUMERIC(78,36) NOT NULL,
                volume NUMERIC(78,36) DEFAULT 0,
                market_cap NUMERIC(78,36) DEFAULT 0,
                is_buy BOOLEAN,
                trade_count INTEGER DEFAULT 0,
                buy_count INTEGER DEFAULT 0,
                sell_count INTEGER DEFAULT 0,
                CONSTRAINT price_history_pkey PRIMARY KEY (mint_address, time)
            );
        `);

        // Convert to hypertable
        await client.query(`
            SELECT create_hypertable(
                'onstrument.price_history',
                'time',
                partitioning_column => 'mint_address',
                number_partitions => 4,
                chunk_time_interval => INTERVAL '1 day',
                if_not_exists => TRUE
            );
        `);

        // Create trades table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onstrument.trades (
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
            );

            CREATE INDEX IF NOT EXISTS idx_trades_token_time 
            ON onstrument.trades (token_address, time DESC);
        `);

        // Convert trades to hypertable
        await client.query(`
            SELECT create_hypertable(
                'onstrument.trades',
                'time',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            );
        `);

        await client.query('COMMIT')

        // Create materialized views
        await client.query(`
            DROP MATERIALIZED VIEW IF EXISTS onstrument.price_history_1m CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS onstrument.price_history_1h CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS onstrument.price_history_1d CASCADE;
        `);

        // Create materialized views for different time intervals
        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS onstrument.price_history_1m
            WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT 
                time_bucket('1 minute', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume,
                last(market_cap, time) as market_cap,
                bool_or(is_buy) as is_buy,
                sum(trade_count) as trade_count,
                sum(buy_count) as buy_count,
                sum(sell_count) as sell_count
            FROM onstrument.price_history
            GROUP BY bucket, mint_address;
        `);

        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS onstrument.price_history_1h
            WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT 
                time_bucket('1 hour', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume,
                last(market_cap, time) as market_cap,
                bool_or(is_buy) as is_buy,
                sum(trade_count) as trade_count,
                sum(buy_count) as buy_count,
                sum(sell_count) as sell_count
            FROM onstrument.price_history
            GROUP BY bucket, mint_address;
        `);

        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS onstrument.price_history_1d
            WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT 
                time_bucket('1 day', time) as bucket,
                mint_address,
                first(open, time) as open,
                max(high) as high,
                min(low) as low,
                last(close, time) as close,
                sum(volume) as volume,
                last(market_cap, time) as market_cap,
                bool_or(is_buy) as is_buy,
                sum(trade_count) as trade_count,
                sum(buy_count) as buy_count,
                sum(sell_count) as sell_count
            FROM onstrument.price_history
            GROUP BY bucket, mint_address;
        `);

        // Add refresh policies
        await client.query(`
            SELECT add_continuous_aggregate_policy('onstrument.price_history_1m',
                start_offset => INTERVAL '1 hour',
                end_offset => INTERVAL '1 minute',
                schedule_interval => INTERVAL '1 minute',
                if_not_exists => TRUE);

            SELECT add_continuous_aggregate_policy('onstrument.price_history_1h',
                start_offset => INTERVAL '1 day',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists => TRUE);

            SELECT add_continuous_aggregate_policy('onstrument.price_history_1d',
                start_offset => INTERVAL '7 days',
                end_offset => INTERVAL '1 day',
                schedule_interval => INTERVAL '1 day',
                if_not_exists => TRUE);
        `);

        console.log('Finished all queries')
        logger.info('Database initialized successfully')
        process.exit(0)
    } catch (error) {
        console.error('Error:', error)
        throw error
    } finally {
        await client.end()
    }
}

// Only run if called directly
if (require.main === module) {
    initializeDatabase()
        .then(() => {
            console.log('Database initialization complete');
        })
        .catch(error => {
            console.error('Failed to initialize database:', error);
            process.exit(1);
        });
} 