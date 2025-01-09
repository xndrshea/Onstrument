import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import apiRouter from './routes/api'
import { TokenDiscoveryService } from './services/discovery/tokenDiscoveryService'
import { CronJob } from 'cron'
import { JupiterPriceUpdater } from './services/price/jupiterPriceUpdater'

dotenv.config()

export function createApp() {
    const app = express()

    // Initialize all services
    initializeServices()

    // Initialize discovery service
    const discoveryService = TokenDiscoveryService.getInstance()

    // Run initial queries immediately
    logger.info('Running initial token discovery...')
    Promise.all([
        discoveryService.fetchGeckoTerminalPools(),
        discoveryService.fetchRaydiumPools()
    ]).catch(error => {
        logger.error('Error in initial token discovery:', error)
    })

    // Set up scheduled jobs
    const geckoJob = new CronJob(
        '* * * * *',
        async () => {
            try {
                logger.info('Starting GeckoTerminal pools fetch...')
                await discoveryService.fetchGeckoTerminalPools()
                logger.info('GeckoTerminal pools fetch completed')
            } catch (error) {
                logger.error('Error fetching GeckoTerminal pools:', error)
            }
        },
        null,    // onComplete
        true,    // start
        undefined, // timezone
        undefined, // context
        true     // runOnInit - This makes it run immediately
    )

    const raydiumJob = new CronJob(
        '*/5 * * * *',
        async () => {
            try {
                logger.info('Starting Raydium pools fetch...')
                await discoveryService.fetchRaydiumPools()
                logger.info('Raydium pools fetch completed')
            } catch (error) {
                logger.error('Error fetching Raydium pools:', error)
            }
        },
        null,
        true,
        undefined,
        undefined,
        true    // runOnInit
    )

    // Start the cron jobs
    geckoJob.start()
    raydiumJob.start()

    logger.info('Price discovery jobs started')

    // Security middleware
    app.use(helmet({
        // Allow WebSocket connections
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginOpenerPolicy: false,
    }))

    app.use(rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: process.env.NODE_ENV === 'development' ? 1000 : 100,
        message: 'Too many requests from this IP, please try again later.'
    }))

    // CORS setup with WebSocket support
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
    app.use(cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        // Allow WebSocket upgrade
        optionsSuccessStatus: 200
    }))

    // Add WebSocket upgrade handling
    app.get('/ws', (req, res) => {
        res.set({
            'Upgrade': 'websocket',
            'Connection': 'Upgrade'
        });
        res.status(426).send('Upgrade Required');
    });

    app.use(express.json())

    // Routes
    app.use('/api', apiRouter)

    // Error handling
    app.use(errorHandler)

    return app
}

export function initializeServices() {
    // Initialize other services
    const jupiterPriceUpdater = JupiterPriceUpdater.getInstance();

    // Cleanup on shutdown
    process.on('SIGTERM', () => {
        jupiterPriceUpdater.cleanup();
        // ... other cleanup
    });
} 