exports.up = async function (pgm) {
    await pgm.sql(`
        CREATE TABLE IF NOT EXISTS onstrument.user_favorites (
            user_id uuid NOT NULL,
            mint_address varchar(255) NOT NULL,
            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, mint_address),
            FOREIGN KEY (user_id) REFERENCES onstrument.users(user_id),
            FOREIGN KEY (mint_address) REFERENCES onstrument.tokens(mint_address)
        );

        CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON onstrument.user_favorites(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_favorites_token ON onstrument.user_favorites(mint_address);
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DROP TABLE IF EXISTS onstrument.user_favorites;
    `);
}; 