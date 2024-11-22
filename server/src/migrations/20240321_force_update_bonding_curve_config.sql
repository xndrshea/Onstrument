-- Remove bonding curve config as it's no longer needed
ALTER TABLE token_platform.tokens
DROP COLUMN bonding_curve_config; 