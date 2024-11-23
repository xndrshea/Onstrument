import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { getTokens as getTokensModel, createToken as createTokenModel, getToken as getTokenModel } from '../models/tokenModel'

class TokenController {
    getTokens = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tokens = await getTokensModel()
            res.json(tokens)
        } catch (error) {
            next(error)
        }
    }

    getToken = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { mint } = req.params
            const token = await getTokenModel(mint)
            if (!token) {
                res.status(404).json({ message: 'Token not found' })
                return
            }
            res.json(token)
        } catch (error) {
            next(error)
        }
    }

    createToken = async (req: Request, res: Response, next: NextFunction) => {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            const {
                mint_address,
                name,
                symbol,
                description,
                total_supply,
                metadata,
                bondingCurveConfig
            } = req.body

            const token = await createTokenModel({
                mint_address,
                name,
                symbol,
                description,
                total_supply,
                metadata,
                bonding_curve_config: bondingCurveConfig
            })

            await client.query('COMMIT')
            res.status(201).json(token)
        } catch (error) {
            await client.query('ROLLBACK')
            next(error)
        } finally {
            client.release()
        }
    }
}

export const tokenController = new TokenController() 