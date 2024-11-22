-- Begin transaction
BEGIN;

-- Truncate tables in the correct order (respecting foreign key constraints)
TRUNCATE TABLE token_platform.tokens CASCADE;

-- Reset sequences
ALTER SEQUENCE token_platform.tokens_id_seq RESTART WITH 1;

-- Insert default metadata template
INSERT INTO token_platform.tokens (
    mint_address,
    name,
    symbol,
    description,
    total_supply,
    metadata,
    bonding_curve_config
) VALUES (
    'DEFAULT_MINT_ADDRESS',
    'Template Token',
    'TMPL',
    'Template token description',
    1000000000000, -- 1,000,000 tokens with 9 decimals
    '{
        "currentSupply": 0,
        "solReserves": 0,
        "bondingCurveATA": null
    }'::jsonb,
    '{
        "curveType": "linear",
        "basePrice": 0.0001,
        "slope": 0.1
    }'::jsonb
);

-- Commit transaction
COMMIT; 