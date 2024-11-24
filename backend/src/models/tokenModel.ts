import { pool as db } from '../config/database';
import { TokenRecord, TokenData } from '../../../shared/types/token';

export async function createToken(token: Omit<TokenRecord, 'id' | 'created_at'>): Promise<TokenRecord> {
    const result = await db.query(
        `INSERT INTO token_platform.tokens (
            mint_address,
            curve_address,
            name,
            symbol,
            description,
            total_supply,
            decimals,
            creator_id,
            network,
            metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`,
        [
            token.mint_address,
            token.curve_address,
            token.name,
            token.symbol,
            token.description || '',
            token.total_supply,
            token.decimals || 9,
            token.creator_id,
            token.network || 'devnet',
            token.metadata || {}
        ]
    );
    return result.rows[0];
}

export async function getTokens(): Promise<TokenData[]> {
    const result = await db.query(`
        SELECT t.*, ts.*
        FROM token_platform.tokens t
        LEFT JOIN token_platform.token_stats ts ON t.id = ts.token_id
        ORDER BY t.created_at DESC
    `);
    return result.rows;
}

export async function getToken(mint: string): Promise<TokenData | null> {
    const result = await db.query(`
        SELECT t.*, ts.*
        FROM token_platform.tokens t
        LEFT JOIN token_platform.token_stats ts ON t.id = ts.token_id
        WHERE t.mint_address = $1
    `, [mint]);
    return result.rows[0] || null;
} 