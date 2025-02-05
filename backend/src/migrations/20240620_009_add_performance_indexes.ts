exports.up = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN
            -- Remove less effective existing indexes
            DROP INDEX IF EXISTS onstrument.idx_tokens_type;
            DROP INDEX IF EXISTS onstrument.idx_tokens_source;

            -- Custom token indexes
            CREATE INDEX IF NOT EXISTS idx_tokens_custom_created 
            ON onstrument.tokens (created_at DESC) 
            WHERE token_type = 'custom';

            CREATE INDEX IF NOT EXISTS idx_tokens_custom_marketcap 
            ON onstrument.tokens (market_cap_usd DESC) 
            WHERE token_type = 'custom';

            -- DEX token indexes
            CREATE INDEX IF NOT EXISTS idx_tokens_dex_volume24h 
            ON onstrument.tokens (volume_24h DESC) 
            WHERE token_type = 'dex';

            CREATE INDEX IF NOT EXISTS idx_tokens_dex_marketcap 
            ON onstrument.tokens (market_cap_usd DESC) 
            WHERE token_type = 'dex';
        END $$;
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN
            -- Remove new indexes
            DROP INDEX IF EXISTS 
                onstrument.idx_tokens_custom_created,
                onstrument.idx_tokens_custom_marketcap,
                onstrument.idx_tokens_dex_volume24h,
                onstrument.idx_tokens_dex_marketcap;

            -- Restore original indexes
            CREATE INDEX IF NOT EXISTS idx_tokens_type 
            ON onstrument.tokens (token_type);

            CREATE INDEX IF NOT EXISTS idx_tokens_source 
            ON onstrument.tokens (token_source);
        END $$;
    `);
}; 