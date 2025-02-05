exports.up = async function (pgm) {
    await pgm.sql(`
        ALTER TABLE onstrument.users 
        ADD COLUMN created_tokens TEXT[] DEFAULT ARRAY[]::TEXT[];

        CREATE INDEX idx_users_created_tokens 
        ON onstrument.users USING GIN (created_tokens);
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DROP INDEX IF EXISTS onstrument.idx_users_created_tokens;
        ALTER TABLE onstrument.users DROP COLUMN IF EXISTS created_tokens;
    `);
}; 