-- Begin transaction
BEGIN;

-- Drop existing schema if it exists
DROP SCHEMA IF EXISTS token_platform CASCADE;

-- Create fresh schema
CREATE SCHEMA token_platform;

-- Create users table first (since tokens reference it)
CREATE TABLE token_platform.users (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tokens table with all required fields
CREATE TABLE token_platform.tokens (
    id SERIAL PRIMARY KEY,
    mint_address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT,
    total_supply BIGINT NOT NULL,
    creator_id INTEGER REFERENCES token_platform.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{
        "currentSupply": 0,
        "solReserves": 0,
        "bondingCurveATA": null,
        "image_url": ""
    }'::jsonb NOT NULL,
    bonding_curve_config JSONB DEFAULT '{
        "curveType": "linear",
        "basePrice": 0.0001,
        "slope": 0.1
    }'::jsonb NOT NULL
);

-- Add any necessary indexes
CREATE INDEX tokens_mint_address_idx ON token_platform.tokens(mint_address);
CREATE INDEX tokens_creator_id_idx ON token_platform.tokens(creator_id);

-- Add constraints
ALTER TABLE token_platform.tokens
ADD CONSTRAINT valid_bonding_curve_config
CHECK (
    (bonding_curve_config->>'curveType' IS NOT NULL) AND
    (bonding_curve_config->>'basePrice' IS NOT NULL) AND
    (
        (bonding_curve_config->>'curveType' = 'linear' AND bonding_curve_config->>'slope' IS NOT NULL) OR
        (bonding_curve_config->>'curveType' = 'exponential' AND bonding_curve_config->>'exponent' IS NOT NULL) OR
        (bonding_curve_config->>'curveType' = 'logarithmic' AND bonding_curve_config->>'logBase' IS NOT NULL)
    )
);

-- Commit transaction
COMMIT; 