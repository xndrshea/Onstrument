import { Request, Response, NextFunction } from 'express'
import { TokenModel } from '../models/Token'
import { AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import { pool } from '../config/database'

export const tokenController = {
    async createToken(req: Request, res: Response, next: NextFunction) {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            logger.info('Creating token with data:', JSON.stringify(req.body, null, 2))

            const {
                mint_address,
                name,
                symbol,
                description,
                total_supply,
                creator,
                metadata,
                bondingCurveConfig
            } = req.body

            // Check if token exists
            const existingToken = await client.query(
                'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
                [mint_address]
            )

            if (existingToken.rows[0]) {
                await client.query('COMMIT')
                logger.info(`Token ${mint_address} already exists, returning existing token`)
                return res.status(200).json(existingToken.rows[0])
            }

            // Create or get creator_id
            let creator_id = null
            if (creator) {
                const userResult = await client.query(
                    `INSERT INTO token_platform.users (wallet_address)
                     VALUES ($1)
                     ON CONFLICT (wallet_address) DO UPDATE SET last_login = CURRENT_TIMESTAMP
                     RETURNING id`,
                    [creator]
                )
                creator_id = userResult.rows[0].id
            }

            // Insert the token
            const result = await client.query(
                `INSERT INTO token_platform.tokens 
                (mint_address, name, symbol, description, total_supply, creator_id, metadata, bonding_curve_config, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                RETURNING *`,
                [
                    mint_address,
                    name,
                    symbol,
                    description || '',
                    total_supply,
                    creator_id,
                    JSON.stringify(metadata),
                    JSON.stringify(bondingCurveConfig)
                ]
            )

            await client.query('COMMIT')

            // Format the response
            const createdToken = {
                ...result.rows[0],
                metadata: typeof result.rows[0].metadata === 'string' ?
                    JSON.parse(result.rows[0].metadata) : result.rows[0].metadata,
                bondingCurveConfig: typeof result.rows[0].bonding_curve_config === 'string' ?
                    JSON.parse(result.rows[0].bonding_curve_config) : result.rows[0].bonding_curve_config
            }

            logger.info('Token created successfully:', createdToken)
            res.status(201).json(createdToken)

        } catch (error: any) {
            await client.query('ROLLBACK')
            logger.error('Error creating token:', error)

            if (error instanceof AppError) {
                next(error)
            } else if (error instanceof SyntaxError) {
                next(new AppError('Invalid JSON in metadata or bondingCurveConfig', 400))
            } else if (error.code === '23505') {
                next(new AppError('Token already exists', 409))
            } else {
                next(new AppError(`Failed to create token: ${error.message}`, 400))
            }
        } finally {
            client.release()
        }
    },

    async getTokens(_req: Request, res: Response, next: NextFunction) {
        try {
            const tokens = await TokenModel.findAll()
            res.json(tokens)
        } catch (error) {
            logger.error('Error fetching tokens:', error)
            next(new AppError('Failed to fetch tokens', 400))
        }
    },

    async getToken(req: Request, res: Response, next: NextFunction) {
        try {
            const token = await TokenModel.findOne(req.params.mint)
            if (!token) {
                throw new AppError('Token not found', 404)
            }
            res.json(token)
        } catch (error) {
            next(error)
        }
    }
} 