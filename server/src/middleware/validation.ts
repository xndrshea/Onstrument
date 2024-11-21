import { Request, Response, NextFunction } from 'express'
import { AppError } from './errorHandler'
import { logger } from '../utils/logger'

export const validateToken = (req: Request, _res: Response, next: NextFunction) => {
    const { mint_address, name, symbol, total_supply, metadata, bondingCurveConfig } = req.body

    logger.info('Validating token data:', { mint_address, name, symbol, total_supply })

    if (!mint_address) {
        return next(new AppError('Missing mint_address', 400))
    }

    if (!name || typeof name !== 'string') {
        return next(new AppError('Invalid or missing name', 400))
    }

    // Symbol validation
    if (!symbol) {
        return next(new AppError('Missing symbol', 400))
    }

    if (typeof symbol !== 'string') {
        return next(new AppError('Symbol must be a string', 400))
    }

    if (symbol.length > 10) {
        return next(new AppError('Symbol too long (max 10 characters)', 400))
    }

    if (symbol.length < 1) {
        return next(new AppError('Symbol must not be empty', 400))
    }

    // Total supply validation
    if (total_supply === undefined || total_supply === null) {
        return next(new AppError('Missing total_supply', 400))
    }

    const parsedSupply = Number(total_supply)
    if (isNaN(parsedSupply) || parsedSupply <= 0) {
        return next(new AppError('Total supply must be a positive number', 400))
    }

    // Metadata validation
    if (metadata) {
        try {
            const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
            if (typeof parsedMetadata !== 'object' || parsedMetadata === null) {
                logger.error('Invalid metadata format:', metadata)
                return next(new AppError('Invalid metadata format', 400))
            }
        } catch (error) {
            logger.error('Metadata validation error:', error, metadata)
            return next(new AppError('Invalid metadata JSON', 400))
        }
    }

    // Bonding curve config validation
    if (bondingCurveConfig) {
        try {
            const parsedConfig = typeof bondingCurveConfig === 'string' ?
                JSON.parse(bondingCurveConfig) : bondingCurveConfig

            if (parsedConfig && typeof parsedConfig === 'object') {
                const { initialPrice, slope, reserveRatio } = parsedConfig

                // Validate required fields exist
                if (initialPrice === undefined || slope === undefined || reserveRatio === undefined) {
                    return next(new AppError('Missing required bonding curve parameters', 400))
                }

                // Validate field types and ranges
                if (typeof initialPrice !== 'number' || initialPrice <= 0) {
                    return next(new AppError('Initial price must be a positive number', 400))
                }
                if (typeof slope !== 'number' || slope <= 0) {
                    return next(new AppError('Slope must be a positive number', 400))
                }
                if (typeof reserveRatio !== 'number' || reserveRatio <= 0 || reserveRatio > 1) {
                    return next(new AppError('Reserve ratio must be between 0 and 1', 400))
                }
            }
        } catch (error) {
            logger.error('BondingCurveConfig validation error:', error, bondingCurveConfig)
            return next(new AppError('Invalid bondingCurveConfig JSON', 400))
        }
    }

    next()
} 