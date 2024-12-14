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
        // Part 1: Regular table creation in transaction
        await client.query('BEGIN')

        // Create schema first
        await client.query(`CREATE SCHEMA IF NOT EXISTS token_platform`)

        // Enable TimescaleDB
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE')

        // Drop existing continuous aggregates first
        await client.query(`
            DROP MATERIALIZED VIEW IF EXISTS token_platform.price_history_1m CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS token_platform.price_history_1h CASCADE;
            DROP MATERIALIZED VIEW IF EXISTS token_platform.price_history_1d CASCADE;
        `)

        // Drop existing tables to recreate as hypertables
        await client.query(`DROP TABLE IF EXISTS token_platform.price_history CASCADE`)
        await client.query(`DROP TABLE IF EXISTS token_platform.trades CASCADE`)

        // Create custom_tokens table (non-timeseries)
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.custom_tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                curve_address VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                decimals INTEGER DEFAULT 9,
                description TEXT,
                metadata_url TEXT,
                curve_config JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create or update tokens table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.tokens (
                mint_address VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                symbol VARCHAR(20),
                metadata_url TEXT,
                metadata_status VARCHAR(50),
                metadata_source VARCHAR(50),
                metadata_fetch_attempts INTEGER DEFAULT 0,
                last_metadata_fetch TIMESTAMP WITH TIME ZONE,
                verified BOOLEAN DEFAULT FALSE,
                description TEXT,
                image_url TEXT,
                attributes JSONB,
                off_chain_metadata JSONB
            );
        `);

        // Add after tokens table creation, around line 73
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.raydium_pools (
                pool_address VARCHAR(255) PRIMARY KEY,
                base_mint VARCHAR(255) NOT NULL,
                quote_mint VARCHAR(255) NOT NULL,
                base_decimals INTEGER NOT NULL,
                quote_decimals INTEGER NOT NULL,
                program_id VARCHAR(255) NOT NULL,
                version INTEGER NOT NULL,
                pool_type VARCHAR(50) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_pool_type CHECK (pool_type IN ('LEGACY_AMM', 'STANDARD_AMM', 'CLMM'))
            );

            -- Index for fast lookups by mint address
            CREATE INDEX IF NOT EXISTS idx_raydium_pools_base_mint 
            ON token_platform.raydium_pools(base_mint);
            
            CREATE INDEX IF NOT EXISTS idx_raydium_pools_quote_mint 
            ON token_platform.raydium_pools(quote_mint);

            CREATE INDEX IF NOT EXISTS idx_raydium_pools_mints 
            ON token_platform.raydium_pools(base_mint, quote_mint);
        `);

        // Create price_history table first
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_platform.price_history (
                time TIMESTAMPTZ NOT NULL,
                mint_address VARCHAR(255) NOT NULL,
                price NUMERIC(40, 18) NOT NULL,
                open NUMERIC(40, 18) NOT NULL,
                high NUMERIC(40, 18) NOT NULL,
                low NUMERIC(40, 18) NOT NULL,
                close NUMERIC(40, 18) NOT NULL,
                volume NUMERIC(40, 18) DEFAULT 0,
                UNIQUE(time, mint_address)
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
                compress_after => INTERVAL '7 days');
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
                amount DECIMAL NOT NULL,
                total DECIMAL NOT NULL,
                price DECIMAL NOT NULL,
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
                schedule_interval => INTERVAL '1 minute');

            SELECT add_continuous_aggregate_policy('token_platform.price_history_1h',
                start_offset => INTERVAL '1 day',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour');

            SELECT add_continuous_aggregate_policy('token_platform.price_history_1d',
                start_offset => INTERVAL '7 days',
                end_offset => INTERVAL '1 day',
                schedule_interval => INTERVAL '1 day');
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