-- Update tokens table schema
ALTER TABLE token_platform.tokens 
    ADD COLUMN IF NOT EXISTS mint_address VARCHAR(44) NOT NULL UNIQUE,
    ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL,
    ADD COLUMN IF NOT EXISTS symbol VARCHAR(10) NOT NULL,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES token_platform.users(id),
    ADD COLUMN IF NOT EXISTS total_supply NUMERIC(20, 0) NOT NULL,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS network VARCHAR(10) DEFAULT 'devnet',
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tokens_mint_address ON token_platform.tokens(mint_address);
CREATE INDEX IF NOT EXISTS idx_tokens_creator_id ON token_platform.tokens(creator_id);

-- Create token stats table if it doesn't exist
CREATE TABLE IF NOT EXISTS token_platform.token_stats (
    token_id INTEGER PRIMARY KEY REFERENCES token_platform.tokens(id),
    holder_count INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    last_price NUMERIC(20, 9),
    market_cap NUMERIC(20, 2),
    volume_24h NUMERIC(20, 2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS token_platform.users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster wallet address lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON token_platform.users(wallet_address); 