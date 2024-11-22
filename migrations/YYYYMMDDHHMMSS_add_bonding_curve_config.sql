ALTER TABLE tokens
ADD COLUMN bonding_curve_config JSONB;

-- Update existing tokens with default linear curve config
UPDATE tokens
SET bonding_curve_config = jsonb_build_object(
    'curveType', 'linear',
    'basePrice', 0.0001,
    'slope', 0.1
)
WHERE bonding_curve_config IS NULL;

-- Add a NOT NULL constraint after setting defaults
ALTER TABLE tokens
ALTER COLUMN bonding_curve_config SET NOT NULL; 