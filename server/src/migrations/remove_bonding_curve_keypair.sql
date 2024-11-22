-- Remove bondingCurveKeypair from metadata column
UPDATE token_launchpad.tokens
SET metadata = metadata::jsonb - 'bondingCurveKeypair';

-- Note: This will automatically remove the bondingCurveKeypair field from all existing tokens 