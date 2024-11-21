-- Create schemas
CREATE SCHEMA IF NOT EXISTS token_platform;

-- Users table
CREATE TABLE IF NOT EXISTS token_platform.users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Tokens table
CREATE TABLE IF NOT EXISTS token_platform.tokens (
    id SERIAL PRIMARY KEY,
    mint_address VARCHAR(44) UNIQUE NOT NULL,
    creator_id INTEGER REFERENCES token_platform.users(id),
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    description TEXT,
    total_supply NUMERIC(20) NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 9,
    image_url TEXT,
    network VARCHAR(10) NOT NULL DEFAULT 'devnet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    CONSTRAINT valid_network CHECK (network IN ('mainnet', 'devnet'))
);

-- Token Statistics table
CREATE TABLE IF NOT EXISTS token_platform.token_stats (
    token_id INTEGER PRIMARY KEY REFERENCES token_platform.tokens(id),
    holder_count INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    last_price NUMERIC(20,9),
    market_cap NUMERIC(20,2),
    volume_24h NUMERIC(20,2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON token_platform.tokens(creator_id);
CREATE INDEX IF NOT EXISTS idx_tokens_mint_address ON token_platform.tokens(mint_address); 