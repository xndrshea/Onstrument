import { pool } from '../config/database'
import { logger } from '../utils/logger'

export interface Token {
    mint_address: string
    name: string
    symbol: string
    description?: string
    creator_id?: number
    total_supply: number
    image_url?: string
    network?: 'mainnet' | 'devnet'
    metadata?: {
        bondingCurve?: string
        bondingCurveATA?: string
        reserveAccount?: string
        initialSupply?: number
        currentSupply?: number
    }
}

export const TokenModel = {
    async create(token: Token) {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            const result = await client.query(
                `INSERT INTO token_platform.tokens 
                (mint_address, name, symbol, description, total_supply, image_url, network, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`,
                [
                    token.mint_address,
                    token.name,
                    token.symbol,
                    token.description,
                    token.total_supply,
                    token.image_url,
                    token.network || 'devnet',
                    JSON.stringify(token.metadata)
                ]
            )

            await client.query('COMMIT')
            return result.rows[0]
        } catch (error) {
            await client.query('ROLLBACK')
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
    },

    async findAll() {
        const result = await pool.query('SELECT * FROM token_platform.tokens')
        return result.rows
    }
} 