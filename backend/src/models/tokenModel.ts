import { pool } from '../db/pool';
import { logger } from '../utils/logger';

export class TokenModel {
    static async getTokens() {
        try {
            logger.info('Executing getTokens query');
            const result = await pool.query(`
                SELECT t.*, ts.price, ts.volume_24h, ts.liquidity,
                       ts.holder_count, ts.transaction_count, ts.last_updated
                FROM token_platform.tokens t
                LEFT JOIN token_platform.token_stats ts ON t.id = ts.token_id
                ORDER BY t.created_at DESC
            `);
            logger.info(`Retrieved ${result.rows.length} tokens from database`);
            logger.debug('Token query results:', result.rows);
            return result.rows;
        } catch (error) {
            logger.error('Error in getTokens:', error);
            throw error;
        }
    }

    static async getTokenByMintAddress(mintAddress: string) {
        try {
            const result = await pool.query(`
                SELECT t.*, ts.holder_count, ts.transaction_count, ts.last_price, 
                       ts.market_cap, ts.volume_24h, ts.total_volume
                FROM token_platform.tokens t
                LEFT JOIN token_platform.token_stats ts ON t.id = ts.token_id
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

            // Initialize token stats
            await client.query(`
                INSERT INTO token_platform.token_stats (token_id)
                VALUES ($1)
            `, [tokenResult.rows[0].id]);

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