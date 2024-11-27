import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { curveType } from '../../../shared/types/token';

class AppError extends Error {
    constructor(message: string, public statusCode: number) {
        super(message);
    }
}

export const validateTokenData = (req: Request, res: Response, next: NextFunction) => {
    const {
        mintAddress,
        curveAddress,
        name,
        symbol,
        totalSupply,
        curveType,
        basePrice,
        slope,
        exponent,
        logBase
    } = req.body;

    try {
        // Basic field validation
        if (!mintAddress || !curveAddress) {
            throw new AppError('Missing mintAddress or curveAddress', 400);
        }

        if (!name || name.length > 100) {
            throw new AppError('Invalid name (max 100 characters)', 400);
        }

        if (!symbol || symbol.length > 10) {
            throw new AppError('Invalid symbol (max 10 characters)', 400);
        }

        // Curve parameter validation
        if (!Object.values(curveType).includes(curveType)) {
            throw new AppError('Invalid curve type', 400);
        }

        if (typeof basePrice !== 'number' || basePrice <= 0) {
            throw new AppError('Invalid base price', 400);
        }

        // Curve-specific parameter validation
        switch (curveType) {
            case curveType.Linear:
                if (typeof slope !== 'number' || slope <= 0) {
                    throw new AppError('Invalid slope for linear curve', 400);
                }
                break;

            case curveType.Exponential:
                if (typeof exponent !== 'number' || exponent <= 0) {
                    throw new AppError('Invalid exponent for exponential curve', 400);
                }
                break;

            case curveType.Logarithmic:
                if (typeof logBase !== 'number' || logBase <= 0) {
                    throw new AppError('Invalid log base for logarithmic curve', 400);
                }
                break;
        }

        next();
    } catch (error) {
        if (error instanceof AppError) {
            logger.warn('Token validation failed:', error.message);
            res.status(error.statusCode).json({ error: error.message });
        } else {
            logger.error('Unexpected validation error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

export const validateTradeData = (req: Request, res: Response, next: NextFunction) => {
    const { mintAddress, traderAddress, signature, amount, pricePerToken, totalPrice, isBuy } = req.body;

    try {
        if (!mintAddress || !traderAddress || !signature) {
            throw new AppError('Missing required trade parameters', 400);
        }

        if (typeof amount !== 'number' || amount <= 0) {
            throw new AppError('Invalid trade amount', 400);
        }

        if (typeof pricePerToken !== 'number' || pricePerToken < 0) {
            throw new AppError('Invalid price per token', 400);
        }

        if (typeof totalPrice !== 'number' || totalPrice < 0) {
            throw new AppError('Invalid total price', 400);
        }

        if (typeof isBuy !== 'boolean') {
            throw new AppError('Invalid trade type', 400);
        }

        next();
    } catch (error) {
        if (error instanceof AppError) {
            logger.warn('Trade validation failed:', error.message);
            res.status(error.statusCode).json({ error: error.message });
        } else {
            logger.error('Unexpected validation error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}; 