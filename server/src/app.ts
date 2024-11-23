import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler } from './middleware/errorHandler'
import { tokenRoutes } from './routes/tokenRoutes'
import { logger } from './utils/logger'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import apiRouter from './routes/api';

dotenv.config()

const app = express()

// Security middleware
app.use(helmet())
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 1000 : 100, // More lenient in development
    message: 'Too many requests from this IP, please try again later.'
}))

// CORS setup - simplified for development
if (process.env.NODE_ENV === 'development') {
    app.use(cors())
} else {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true)
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }))
}

app.use(express.json())

// Routes - mount at root level since routes include full paths
app.use('/api', tokenRoutes)
app.use('/api', apiRouter)

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Error:', err)
    errorHandler(err, req, res, next)
})

export { app } 