import { Request, Response, NextFunction } from 'express'
import { AppError } from './errorHandler'

export const validateToken = (req: Request, res: Response, next: NextFunction) => {
    const { mint, name, symbol, creator, supply } = req.body

    if (!mint || !name || !symbol || !creator || !supply) {
        return next(new AppError('Missing required fields', 400))
    }

    if (typeof supply !== 'number' || supply <= 0) {
        return next(new AppError('Invalid supply amount', 400))
    }

    if (symbol.length > 5) {
        return next(new AppError('Symbol must be 5 characters or less', 400))
    }

    next()
} 