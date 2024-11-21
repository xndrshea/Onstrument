import { pool } from '../config/database'
import { logger } from '../utils/logger'

export interface Token {
    mint: string
    name: string
    symbol: string
    description?: string
    creator: string
    supply: number
    imageUrl?: string
    network?: 'mainnet' | 'devnet'
    metadata?: Record<string, string>
    stats?: {
        holders: number
        transactions: number
    }
    createdAt?: Date
}

export const TokenModel = {
    async create(token: Token) {
        const client = await pool.connect()
        try {
            const result = await client.query(
                `INSERT INTO token_platform.tokens 
                (mint_address, name, symbol, description, total_supply, image_url, network)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
                [token.mint, token.name, token.symbol, token.description, token.supply, token.imageUrl, token.network || 'devnet']
            )
            return result.rows[0]
        } catch (error) {
            logger.error('Error creating token:', error)
            throw error
        } finally {
            client.release()
        }
    },

    async findByCreator(creator: string) {
        const result = await pool.query(
            `SELECT * FROM token_platform.tokens WHERE creator_id = (
                SELECT id FROM token_platform.users WHERE wallet_address = $1
            )`,
            [creator]
        )
        return result.rows
    },

    async findOne(mint: string) {
        const result = await pool.query(
            'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
            [mint]
        )
        return result.rows[0] || null
    },

    async updateStats(mint: string, stats: { holders: number; transactions: number }) {
        const client = await pool.connect()
        try {
            await client.query(
                `UPDATE token_platform.token_stats 
                 SET holder_count = $1, transaction_count = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE token_id = (
                     SELECT id FROM token_platform.tokens WHERE mint_address = $3
                 )`,
                [stats.holders, stats.transactions, mint]
            )
            return true
        } catch (error) {
            logger.error('Error updating token stats:', error)
            throw error
        } finally {
            client.release()
        }
    }
} 