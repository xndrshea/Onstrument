import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export class AppError extends Error {
    statusCode: number
    status: string
    isOperational: boolean

    constructor(message: string, statusCode: number) {
        super(message)
        this.statusCode = statusCode
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'
        this.isOperational = true
        Error.captureStackTrace(this, this.constructor)
    }
}

export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err.message === 'Not allowed by CORS') {
        logger.error(`CORS Error - Origin: ${req.headers.origin}`)
        res.status(403).json({
            status: 'error',
            message: 'CORS error: Origin not allowed'
        })
        return
    }

    if (err instanceof AppError) {
        logger.error(`${err.statusCode} - ${err.message}`)
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        })
        return
    }

    logger.error('Unexpected error:', err)
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong'
    })
} 