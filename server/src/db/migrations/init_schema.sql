-- Drop existing schemas
DROP SCHEMA IF EXISTS token_platform CASCADE;
DROP SCHEMA IF EXISTS token_launchpad CASCADE;

-- Create fresh schema
CREATE SCHEMA token_platform;

-- Create users table
CREATE TABLE token_platform.users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tokens table with all required fields
CREATE TABLE token_platform.tokens (
    id SERIAL PRIMARY KEY,
    mint_address VARCHAR(44) UNIQUE NOT NULL,
    bonding_curve_address VARCHAR(44) NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    description TEXT,
    total_supply NUMERIC(20) NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 9,
    creator_id INTEGER REFERENCES token_platform.users(id),
    network VARCHAR(10) NOT NULL DEFAULT 'devnet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL,
    bonding_curve_config JSONB NOT NULL,
    CONSTRAINT valid_network CHECK (network IN ('mainnet', 'devnet')),
    CONSTRAINT valid_metadata CHECK (
        metadata ? 'bondingCurveATA' AND
        metadata ? 'totalSupply'        
    ),
    CONSTRAINT valid_bonding_curve_config CHECK (
        (bonding_curve_config->>'curveType' IS NOT NULL) AND
        (bonding_curve_config->>'basePrice' IS NOT NULL) AND
        (
            (bonding_curve_config->>'curveType' = 'linear' AND bonding_curve_config->>'slope' IS NOT NULL) OR
            (bonding_curve_config->>'curveType' = 'exponential' AND bonding_curve_config->>'exponent' IS NOT NULL) OR
            (bonding_curve_config->>'curveType' = 'logarithmic' AND bonding_curve_config->>'logBase' IS NOT NULL)
        )
    )
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

-- Create indexes
CREATE INDEX idx_tokens_mint_address ON token_platform.tokens(mint_address);
CREATE INDEX idx_tokens_creator_id ON token_platform.tokens(creator_id);
CREATE INDEX idx_tokens_bonding_curve_address ON token_platform.tokens(bonding_curve_address);
CREATE INDEX idx_users_wallet_address ON token_platform.users(wallet_address);