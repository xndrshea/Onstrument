import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class TokenModel {
    static async getTokens() {
        try {
            logger.info('Executing getTokens query');
            const result = await pool.query(`
                SELECT 
                    t.*,
                    ct.curve_address
                FROM token_platform.tokens t
                LEFT JOIN token_platform.custom_tokens ct ON t.mint_address = ct.mint_address
                ORDER BY t.created_at DESC
            `);
            logger.info(`Retrieved ${result.rows.length} tokens from database`);
            return result.rows;
        } catch (error) {
            logger.error('Error in getTokens:', error);
            throw error;
        }
    }

    static async getTokenByMintAddress(mintAddress: string) {
        try {
            const result = await pool.query(`
                SELECT t.*
                FROM token_platform.tokens t
                WHERE t.mint_address = $1
            `, [mintAddress]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error in getTokenByMintAddress:', error);
            throw error;
        }
    }

    static async createToken(tokenData: any) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert token
            const tokenResult = await client.query(`
                INSERT INTO token_platform.tokens (
                    mint_address, curve_address, name, symbol, description,
                    metadata_uri, total_supply, decimals, creator_id, 
                    network, curve_config
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `, [
                tokenData.mintAddress,
                tokenData.curveAddress,
                tokenData.name,
                tokenData.symbol,
                tokenData.description,
                tokenData.metadataUri,
                tokenData.totalSupply,
                tokenData.decimals,
                tokenData.creatorId,
                tokenData.network,
                tokenData.curveConfig
            ]);

            await client.query('COMMIT');
            return tokenResult.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error in createToken:', error);
            throw error;
        } finally {
            client.release();
        }
    }
} 