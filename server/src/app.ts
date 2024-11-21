import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initializeDatabase } from './config/database'
import { errorHandler } from './middleware/errorHandler'
import { tokenRoutes } from './routes/tokenRoutes'
import { logger } from './utils/logger'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

dotenv.config()

const app = express()

// Security middleware
app.use(helmet())
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
}))

// CORS setup - simplified for development
if (process.env.NODE_ENV === 'development') {
    app.use(cors())
} else {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
    app.use(cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }))
}

app.use(express.json())

// Routes
app.use('/api/tokens', tokenRoutes)

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Error:', err)
    errorHandler(err, req, res, next)
})

export { app } 