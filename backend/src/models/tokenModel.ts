import { pool } from '../config/database';
import {
    TokenRecord,
    CreateTokenParams
} from '../../../shared/types/token';
import BN from 'bn.js';

export class TokenModel {
    static async getTokens(): Promise<TokenRecord[]> {
        const result = await pool.query('SELECT * FROM tokens ORDER BY created_at DESC');
        return result.rows.map(row => this.mapDbToToken(row));
    }

    static async getToken(mint: string): Promise<TokenRecord | null> {
        const result = await pool.query(
            'SELECT * FROM tokens WHERE mint_address = $1',
            [mint]
        );
        return result.rows.length ? this.mapDbToToken(result.rows[0]) : null;
    }

    static async create(params: CreateTokenParams): Promise<TokenRecord> {
        const result = await pool.query(
            `INSERT INTO tokens (
                mint_address, 
                curve_address,
                name,
                symbol,
                total_supply,
                curve_config
            ) VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
            [
                params.mint_address,
                params.curve_address,
                params.name,
                params.symbol,
                params.total_supply.toString(),
                JSON.stringify(params)
            ]
        );
        return this.mapDbToToken(result.rows[0]);
    }

    private static mapDbToToken(row: any): TokenRecord {
        return {
            ...row,
            total_supply: new BN(row.total_supply),
            curve_config: {
                ...row.curve_config,
                base_price: new BN(row.curve_config.base_price)
            }
        };
    }
}

// Export the static methods to match the controller's imports
export const getTokens = TokenModel.getTokens.bind(TokenModel);
export const getToken = TokenModel.getToken.bind(TokenModel);
export const createToken = TokenModel.create.bind(TokenModel); 