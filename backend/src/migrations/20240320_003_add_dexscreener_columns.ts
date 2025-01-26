exports.up = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN 
            ALTER TABLE onstrument.tokens
            ADD COLUMN IF NOT EXISTS dexscreener_checked BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS dexscreener_checked_at TIMESTAMP WITH TIME ZONE;
        END $$;
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN 
            ALTER TABLE onstrument.tokens
            DROP COLUMN IF EXISTS dexscreener_checked,
            DROP COLUMN IF EXISTS dexscreener_checked_at;
        END $$;
    `);
}; 