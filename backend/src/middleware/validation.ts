import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const validateTokenData = (req: Request, res: Response, next: NextFunction) => {
    try {
        // Log the incoming request body
        logger.debug('Validating token data:', req.body);

        if (!req.body) {
            return res.status(400).json({ error: 'Request body is required' });
        }

        const requiredFields = [
            'mintAddress',
            'curveAddress',
            'name',
            'symbol',
            'totalSupply',
            'curveConfig'
        ];

        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'Missing required fields',
                missingFields
            });
        }

        // Validate curveConfig structure
        if (!req.body.curveConfig || typeof req.body.curveConfig !== 'object') {
            return res.status(400).json({
                error: 'Invalid curveConfig',
                details: 'curveConfig must be an object'
            });
        }

        // Additional validation can be added here

        next();
    } catch (error) {
        logger.error('Validation error:', error);
        res.status(400).json({
            error: 'Validation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}; 