-- Begin transaction
BEGIN;

-- Backup existing metadata and bonding curve config
CREATE TEMP TABLE temp_token_data AS
SELECT 
    mint_address,
    metadata,
    bonding_curve_config
FROM token_platform.tokens;

-- Update tokens table structure
ALTER TABLE token_platform.tokens
DROP COLUMN IF EXISTS bonding_curve_config;

-- Update or add metadata column
ALTER TABLE token_platform.tokens
ALTER COLUMN metadata SET DEFAULT '{
    "currentSupply": 0,
    "solReserves": 0,
    "bondingCurveConfig": {
        "curveType": "linear",
        "basePrice": 0.0001,
        "slope": 0.1
    }
}'::jsonb;

-- Merge existing data into new structure
UPDATE token_platform.tokens t
SET metadata = COALESCE(t.metadata, '{}'::jsonb) || 
    jsonb_build_object(
        'bondingCurveConfig', 
        COALESCE(
            (SELECT bonding_curve_config FROM temp_token_data td WHERE td.mint_address = t.mint_address),
            '{"curveType": "linear", "basePrice": 0.0001, "slope": 0.1}'::jsonb
        )
    );

-- Drop temporary table
DROP TABLE temp_token_data;

-- Commit transaction
COMMIT; 