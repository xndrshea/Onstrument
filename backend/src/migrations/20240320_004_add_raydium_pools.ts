exports.up = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'onstrument' 
                AND table_name = 'raydium_pools'
            ) THEN
                CREATE TABLE onstrument.raydium_pools (
                    pool_id varchar(255) PRIMARY KEY,
                    token0_mint varchar(255) NOT NULL REFERENCES onstrument.tokens(mint_address),
                    token1_mint varchar(255) NOT NULL REFERENCES onstrument.tokens(mint_address),
                    token0_decimals integer NOT NULL,
                    token1_decimals integer NOT NULL,
                    created_at timestamptz DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX idx_raydium_pools_tokens ON onstrument.raydium_pools(token0_mint, token1_mint);
            END IF;
        END $$;
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DO $$ 
        BEGIN 
            IF EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'onstrument' 
                AND table_name = 'raydium_pools'
            ) THEN
                DROP TABLE onstrument.raydium_pools;
            END IF;
        END $$;
    `);
}; 