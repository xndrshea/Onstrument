-- Begin transaction
BEGIN;

-- Drop existing schema if it exists
DROP SCHEMA IF EXISTS token_platform CASCADE;

-- Create fresh schema
CREATE SCHEMA token_platform;

-- Create users table
CREATE TABLE token_platform.users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tokens table
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
    network VARCHAR(10) NOT NULL DEFAULT 'devnet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT valid_network CHECK (network IN ('mainnet', 'devnet'))
);

-- Create token stats table
CREATE TABLE token_platform.token_stats (
    token_id INTEGER PRIMARY KEY REFERENCES token_platform.tokens(id),
    holder_count INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    last_price NUMERIC(20,9),
    market_cap NUMERIC(20,2),
    volume_24h NUMERIC(20,2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create trade history table
CREATE TABLE token_platform.trade_history (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES token_platform.tokens(id),
    trader_address VARCHAR(44) NOT NULL,
    transaction_signature VARCHAR(88) UNIQUE NOT NULL,
    amount NUMERIC(20,9) NOT NULL,
    price NUMERIC(20,9) NOT NULL,
    is_buy BOOLEAN NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_tokens_mint_address ON token_platform.tokens(mint_address);
CREATE INDEX idx_tokens_curve_address ON token_platform.tokens(curve_address);
CREATE INDEX idx_tokens_creator_id ON token_platform.tokens(creator_id);
CREATE INDEX idx_users_wallet_address ON token_platform.users(wallet_address);
CREATE INDEX idx_trade_history_token_id ON token_platform.trade_history(token_id);
CREATE INDEX idx_trade_history_trader ON token_platform.trade_history(trader_address);
CREATE INDEX idx_trade_history_timestamp ON token_platform.trade_history(timestamp);

COMMIT;