exports.up = async function (pgm) {
    await pgm.sql(`
        CREATE TABLE IF NOT EXISTS onstrument.recent_creations (
            id SERIAL PRIMARY KEY,
            mint_address TEXT NOT NULL,
            symbol TEXT,
            creator TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mint_address) REFERENCES onstrument.tokens(mint_address) ON DELETE CASCADE
        );

        -- Index for quick retrieval of recent items
        CREATE INDEX idx_recent_creations_timestamp 
        ON onstrument.recent_creations (timestamp DESC);
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DROP TABLE IF EXISTS onstrument.recent_creations;
    `);
}; 