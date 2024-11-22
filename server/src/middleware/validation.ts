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
                JSON.parse(bondingCurveConfig) : bondingCurveConfig;

            if (!parsedConfig || typeof parsedConfig !== 'object') {
                return next(new AppError('Invalid bonding curve configuration format', 400));
            }

            const { curveType, basePrice } = parsedConfig;

            // Validate required fields exist
            if (!curveType || !basePrice) {
                logger.error('Missing bonding curve parameters:', parsedConfig);
                return next(new AppError('Missing required bonding curve parameters', 400));
            }

            // Validate field types
            if (typeof basePrice !== 'number' || basePrice <= 0 || !Number.isFinite(basePrice)) {
                return next(new AppError('Base price must be a positive finite number', 400));
            }

            // Validate curve-specific parameters
            switch (curveType) {
                case 'linear':
                    if (typeof parsedConfig.slope !== 'number' || !Number.isFinite(parsedConfig.slope)) {
                        return next(new AppError('Linear curve requires valid slope parameter', 400));
                    }
                    break;
                case 'exponential':
                    if (typeof parsedConfig.exponent !== 'number' || !Number.isFinite(parsedConfig.exponent)) {
                        return next(new AppError('Exponential curve requires valid exponent parameter', 400));
                    }
                    break;
                case 'logarithmic':
                    if (typeof parsedConfig.logBase !== 'number' || parsedConfig.logBase <= 1 || !Number.isFinite(parsedConfig.logBase)) {
                        return next(new AppError('Logarithmic curve requires valid logBase parameter greater than 1', 400));
                    }
                    break;
                default:
                    return next(new AppError('Invalid curve type', 400));
            }
        } catch (error) {
            logger.error('Bonding curve config parsing error:', error);
            return next(new AppError('Invalid bondingCurveConfig format', 400));
        }
    } else {
        return next(new AppError('Missing bonding curve configuration', 400));
    }

    next()
} 