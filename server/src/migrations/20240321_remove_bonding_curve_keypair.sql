-- Remove bondingCurveKeypair from metadata column for token_platform schema
UPDATE token_platform.tokens
SET metadata = metadata::jsonb - 'bondingCurveKeypair';
 