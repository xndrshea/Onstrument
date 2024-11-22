import { pool } from '../config/database'
import { logger } from '../utils/logger'

export interface Token {
    id?: number
    mint_address: string
    name: string
    symbol: string
    description?: string
    creator?: string
    creator_id?: number
    total_supply: number
    image_url?: string
    network?: 'mainnet' | 'devnet'
    metadata?: {
        bondingCurveATA?: string
        reserveAccount?: string
    }
    bondingCurveConfig?: {
        initialPrice: number
        slope: number
        reserveRatio: number
    }
    created_at?: string
}

export const TokenModel = {
    async create(token: Token) {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            const existingToken = await client.query(
                'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
                [token.mint_address]
            )

            if (existingToken.rows[0]) {
                await client.query('COMMIT')
                logger.info(`Token ${token.mint_address} already exists`)
                return existingToken.rows[0]
            }

            let creator_id = null
            if (token.creator) {
                const userResult = await client.query(
                    `INSERT INTO token_platform.users (wallet_address)
                     VALUES ($1)
                     ON CONFLICT (wallet_address) DO UPDATE SET last_login = CURRENT_TIMESTAMP
                     RETURNING id`,
                    [token.creator]
                )
                creator_id = userResult.rows[0].id
            }

            const result = await client.query(
                `INSERT INTO token_platform.tokens 
                (mint_address, name, symbol, description, creator_id, total_supply, 
                 image_url, network, metadata, bonding_curve_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [
                    token.mint_address,
                    token.name || 'Unnamed Token',
                    token.symbol || 'UNKNOWN',
                    token.description || '',
                    creator_id,
                    token.total_supply || 0,
                    token.image_url || '',
                    token.network || 'devnet',
                    JSON.stringify({
                        bondingCurveATA: token.metadata?.bondingCurveATA || '',
                        reserveAccount: token.metadata?.reserveAccount || ''
                    }),
                    JSON.stringify(token.bondingCurveConfig || {
                        initialPrice: 0.1,
                        slope: 0.1,
                        reserveRatio: 0.5
                    })
                ]
            )

            await client.query('COMMIT')
            logger.info(`Token created successfully: ${token.mint_address}`)
            return result.rows[0]
        } catch (error) {
            await client.query('ROLLBACK')
            logger.error('Error creating token:', error)
            throw error
        } finally {
            client.release()
        }
    },

    async findAll() {
        try {
            const result = await pool.query(
                'SELECT * FROM token_platform.tokens ORDER BY created_at DESC'
            )
            return result.rows.map(token => ({
                ...token,
                metadata: typeof token.metadata === 'string' ?
                    JSON.parse(token.metadata) : token.metadata,
                bondingCurveConfig: typeof token.bonding_curve_config === 'string' ?
                    JSON.parse(token.bonding_curve_config) : token.bonding_curve_config
            }))
        } catch (error) {
            logger.error('Error fetching all tokens:', error)
            throw error
        }
    },

    async findByCreator(creator: string) {
        try {
            const result = await pool.query(
                `SELECT t.* FROM token_platform.tokens t
                 JOIN token_platform.users u ON t.creator_id = u.id
                 WHERE u.wallet_address = $1
                 ORDER BY t.created_at DESC`,
                [creator]
            )
            return result.rows.map(token => ({
                ...token,
                metadata: typeof token.metadata === 'string' ?
                    JSON.parse(token.metadata) : token.metadata
            }))
        } catch (error) {
            logger.error('Error fetching tokens by creator:', error)
            throw error
        }
    },

    async findOne(mintAddress: string) {
        try {
            const result = await pool.query(
                'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
                [mintAddress]
            )

            if (result.rows.length === 0) {
                return null
            }

            const token = result.rows[0]
            return {
                ...token,
                metadata: typeof token.metadata === 'string' ?
                    JSON.parse(token.metadata) : token.metadata,
                bondingCurveConfig: typeof token.bonding_curve_config === 'string' ?
                    JSON.parse(token.bonding_curve_config) : token.bonding_curve_config
            }
        } catch (error) {
            logger.error('Error fetching token by mint address:', error)
            throw error
        }
    }
} 