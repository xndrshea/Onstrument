export async function createToken(token: Token): Promise<Token> {
    const result = await db.query(
        `INSERT INTO token_platform.tokens (
            mint_address, 
            name, 
            symbol, 
            description,
            total_supply,
            metadata,
            bonding_curve_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
            token.mint_address,
            token.name,
            token.symbol,
            token.description,
            token.total_supply,
            token.metadata,
            token.bonding_curve_config
        ]
    );
    return result.rows[0];
}

export async function getTokens(): Promise<Token[]> {
    const result = await db.query(
        `SELECT * FROM token_platform.tokens ORDER BY created_at DESC`
    );
    return result.rows;
} 