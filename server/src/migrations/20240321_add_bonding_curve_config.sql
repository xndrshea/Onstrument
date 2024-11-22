-- Add bonding_curve_config column to tokens table
ALTER TABLE token_platform.tokens
ADD COLUMN IF NOT EXISTS bonding_curve_config JSONB;

-- Update existing tokens with default bonding curve config
UPDATE token_platform.tokens
SET bonding_curve_config = '{
    "initialPrice": 0.1,
    "slope": 0.1,
    "reserveRatio": 0.5
}'::jsonb
WHERE bonding_curve_config IS NULL; 