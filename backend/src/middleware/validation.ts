import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';
import { NextFunction, Request, Response } from 'express';

export const validateTokenData = (req: Request, res: Response, next: NextFunction) => {
    const { mint_address, name, symbol, total_supply, metadata } = req.body;

    logger.info('Validating token data:', { mint_address, name, symbol, total_supply });

    if (!mint_address) {
        return next(new AppError('Missing mint_address', 400));
    }

    if (!name || typeof name !== 'string') {
        return next(new AppError('Invalid or missing name', 400));
    }

    // Symbol validation
    if (!symbol) {
        return next(new AppError('Missing symbol', 400));
    }

    if (typeof symbol !== 'string') {
        return next(new AppError('Symbol must be a string', 400));
    }

    if (symbol.length > 10) {
        return next(new AppError('Symbol too long (max 10 characters)', 400));
    }

    if (symbol.length < 1) {
        return next(new AppError('Symbol must not be empty', 400));
    }

    // Total supply validation
    if (total_supply === undefined || total_supply === null) {
        return next(new AppError('Missing total_supply', 400));
    }

    const parsedSupply = Number(total_supply);
    if (isNaN(parsedSupply) || parsedSupply <= 0) {
        return next(new AppError('Total supply must be a positive number', 400));
    }

    // Metadata validation (if provided)
    if (metadata) {
        try {
            const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            if (typeof parsedMetadata !== 'object' || parsedMetadata === null) {
                logger.error('Invalid metadata format:', metadata);
                return next(new AppError('Invalid metadata format', 400));
            }
        } catch (error) {
            logger.error('Metadata validation error:', error, metadata);
            return next(new AppError('Invalid metadata JSON', 400));
        }
    }

    next();
}; 