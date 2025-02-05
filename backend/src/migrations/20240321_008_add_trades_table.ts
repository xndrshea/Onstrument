exports.up = async function (pgm) {
    await pgm.sql(`
        CREATE TABLE IF NOT EXISTS onstrument.live_trades (
            id SERIAL PRIMARY KEY,
            mint_address TEXT NOT NULL,
            price DECIMAL NOT NULL,
            volume DECIMAL,
            is_sell BOOLEAN NOT NULL,
            wallet_address TEXT,
            trade_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            symbol TEXT
        );

        CREATE INDEX live_trades_time_idx ON onstrument.live_trades(trade_timestamp);
        CREATE INDEX live_trades_mint_address_idx ON onstrument.live_trades(mint_address);
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DROP TABLE IF EXISTS onstrument.live_trades;
    `);
}; 