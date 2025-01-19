import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import apiRouter from './routes/api'
import { TokenDiscoveryService } from './services/discovery/tokenDiscoveryService'
import { CronJob } from 'cron'
import { JupiterPriceUpdater } from './services/price/jupiterPriceUpdater'
import { wsManager } from './services/websocket/WebSocketManager'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { parameterStore } from './config/parameterStore'

// Remove dotenv import and config loading
logger.info(`Running in ${process.env.NODE_ENV || 'development'} environment`)

export function createApp() {
    const app = express()

    // Add check to ensure parameterStore is initialized
    if (!parameterStore.isInitialized()) {
        throw new Error('Parameter store must be initialized before creating app');
    }

    // Initialize all services
    initializeServices()

    // Initialize discovery service
    const discoveryService = TokenDiscoveryService.getInstance()

    // Run initial queries immediately
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
                await discoveryService.fetchGeckoTerminalPools()
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
                await discoveryService.fetchRaydiumPools()
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

    // CORS setup
    const allowedOrigins = process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []
        : ['http://localhost:3000', 'http://localhost:5173'];

    app.use(cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'solana-client',
            'x-requested-with',
            'pinata-api-key',
            'pinata-secret-api-key'
        ],
        optionsSuccessStatus: 200
    }));

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

    // Add this with your other routes
    app.get('/api/ws/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date(),
            websocket: {
                ...wsManager.getStats(),
                helius: HeliusManager.getInstance().getStatus()
            }
        });
    });

    // Add this near your other routes
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'healthy' });
    });

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