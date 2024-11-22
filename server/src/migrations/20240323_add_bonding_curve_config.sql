-- Begin transaction
BEGIN;

-- First, create a backup of the tokens table
CREATE TABLE IF NOT EXISTS token_platform.tokens_backup AS 
SELECT * FROM token_platform.tokens;

-- Add bonding_curve_config column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'token_platform' 
        AND table_name = 'tokens' 
        AND column_name = 'bonding_curve_config'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE token_platform.tokens
        ADD COLUMN bonding_curve_config JSONB DEFAULT NULL;
    END IF;
END $$;

-- First update: Set default values for null bonding_curve_config
UPDATE token_platform.tokens
SET bonding_curve_config = jsonb_build_object(
    'curveType', 'linear',
    'basePrice', 0.0001,
    'slope', 0.1
)
WHERE bonding_curve_config IS NULL;

-- Second update: Move existing bonding curve configs from metadata
WITH updated_rows AS (
    SELECT 
        id,
        CASE 
            WHEN metadata->>'bondingCurveConfig' IS NOT NULL 
            THEN metadata->'bondingCurveConfig'
            ELSE bonding_curve_config
        END as new_bonding_curve_config,
        CASE 
            WHEN metadata->>'bondingCurveConfig' IS NOT NULL 
            THEN metadata - 'bondingCurveConfig'
            ELSE metadata
        END as new_metadata
    FROM token_platform.tokens
    WHERE metadata IS NOT NULL
)
UPDATE token_platform.tokens t
SET 
    bonding_curve_config = ur.new_bonding_curve_config,
    metadata = ur.new_metadata
FROM updated_rows ur
WHERE t.id = ur.id;

-- Add a check constraint to ensure bonding_curve_config is present
DO $$ 
BEGIN
    -- Drop the constraint if it exists
    ALTER TABLE token_platform.tokens
    DROP CONSTRAINT IF EXISTS bonding_curve_config_required;
    
    -- Add the constraint
    ALTER TABLE token_platform.tokens
    ADD CONSTRAINT bonding_curve_config_required 
    CHECK (bonding_curve_config IS NOT NULL);
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Error adding constraint: %', SQLERRM;
END $$;

-- Commit transaction
COMMIT; 