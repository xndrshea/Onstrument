import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler } from './middleware/errorHandler'
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

// CORS setup
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

// Routes
app.use('/api', apiRouter)

// Error handling
app.use(errorHandler)

export { app } 