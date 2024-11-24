import { TokenRecord } from 'shared/types/token'
import { pool } from '../config/database'
import { logger } from '../utils/logger'


export const dbService = {
    async createToken(token: Omit<TokenRecord, 'creator_id'>, walletAddress: string): Promise<TokenRecord> {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            // Get or create user
            const userResult = await client.query(
                `INSERT INTO token_platform.users (wallet_address)
                 VALUES ($1)
                 ON CONFLICT (wallet_address) DO UPDATE SET last_login = CURRENT_TIMESTAMP
                 RETURNING id`,
                [walletAddress]
            )
            const userId = userResult.rows[0].id

            // Create token
            const tokenResult = await client.query(
                `INSERT INTO token_platform.tokens 
                 (mint_address, curve_address, creator_id, name, symbol, description, total_supply, network, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [
                    token.mint_address,
                    token.curve_address,
                    userId,
                    token.name,
                    token.symbol,
                    token.description,
                    token.total_supply,
                    token.network,
                    token.metadata
                ]
            )

            // Initialize token stats
            await client.query(
                `INSERT INTO token_platform.token_stats (token_id)
                 VALUES ($1)`,
                [tokenResult.rows[0].id]
            )

            await client.query('COMMIT')
            return tokenResult.rows[0]
        } catch (error) {
            await client.query('ROLLBACK')
            logger.error('Error creating token:', error)
            throw error
        } finally {
            client.release()
        }
    },

    async getTokensByCreator(walletAddress: string): Promise<TokenRecord[]> {
        const result = await pool.query(
            `SELECT t.* 
             FROM token_platform.tokens t
             JOIN token_platform.users u ON t.creator_id = u.id
             WHERE u.wallet_address = $1
             ORDER BY t.created_at DESC`,
            [walletAddress]
        )
        return result.rows
    }
} 