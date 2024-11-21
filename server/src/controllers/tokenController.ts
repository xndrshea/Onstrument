import { Request, Response, NextFunction } from 'express'
import { TokenModel } from '../models/Token'
import { AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

export const tokenController = {
    async createToken(req: Request, res: Response, next: NextFunction) {
        try {
            const token = await TokenModel.create(req.body)
            logger.info(`Token created: ${token.mint_address}`)
            res.status(201).json(token)
        } catch (error) {
            next(new AppError('Failed to create token', 400))
        }
    },

    async getTokens(req: Request, res: Response, next: NextFunction) {
        try {
            const { creator } = req.query
            const tokens = creator ? await TokenModel.findByCreator(creator as string) : []
            res.json(tokens)
        } catch (error) {
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
    },

    async updateTokenStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { mint } = req.params
            const { holders, transactions } = req.body

            const token = await TokenModel.findOne(mint)
            if (!token) {
                throw new AppError('Token not found', 404)
            }

            await TokenModel.updateStats(mint, {
                holders: holders || 0,
                transactions: transactions || 0
            })

            res.json({ message: 'Token stats updated successfully' })
        } catch (error) {
            next(new AppError('Failed to update token stats', 400))
        }
    }
} 