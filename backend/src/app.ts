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
import { Express } from 'express'
import { initializeSolPriceJob } from './jobs/solPriceJob'
import csrf from 'csurf'
import cookieParser from 'cookie-parser'
import path from 'path'

// Add at the top of the file
declare global {
    namespace Express {
        interface Request {
            csrfToken(): string;
        }
    }
}

export function createApp() {
    const app = express()

    // Add check to ensure parameterStore is initialized
    if (!parameterStore.isInitialized()) {
        throw new Error('Parameter store must be initialized before creating app');
    }

    // Add health check BEFORE any middleware
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'healthy' });
    });

    // Initialize all services
    initializeServices()

    // Initialize discovery service
    const discoveryService = TokenDiscoveryService.getInstance();

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

    // Don't start it yet
    app.set('geckoJob', geckoJob)
    app.set('raydiumJob', raydiumJob)

    // Security middleware
    app.use(helmet({
        // Allow WebSocket connections
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginOpenerPolicy: false,
    }))

    // Add cookie-parser before CSRF
    app.use(cookieParser())

    // CORS setup first
    const allowedOrigins = process.env.NODE_ENV === 'production'
        ? [
            'https://onstrument.com',
            'https://www.onstrument.com',
            'https://api.onstrument.com',
            'http://localhost:3000', // For local testing
            'http://localhost:5173'
        ]
        : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001'];

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.error('Not allowed by CORS:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-CSRF-Token',
            'solana-client',
            'x-requested-with',
            'pinata-api-key',
            'pinata-secret-api-key',
        ]
    }));

    // Rate limiting after CORS
    app.use(rateLimit({
        windowMs: 1 * 60 * 1000,    // 1 minute window (more appropriate for trading)
        max: process.env.NODE_ENV === 'development'
            ? 1000                   // dev: 1000 requests per minute
            : 600,                   // prod: 300 requests per minute (5 per second)
        message: 'Too many requests from this IP, please try again later.'
    }));

    // Add express.json before CSRF
    app.use(express.json())

    // Single CSRF setup
    const csrfProtection = csrf({
        cookie: {
            key: '_csrf',
            secure: process.env.NODE_ENV === 'production',
            sameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax'
        }
    });

    // CSRF token endpoint
    app.get('/api/csrf-token', csrfProtection, (req, res) => {
        res.json({ csrfToken: req.csrfToken() });
    });

    // Apply CSRF protection to specific routes
    app.use('/api', (req, res, next) => {
        // Skip CSRF for initial auth endpoints
        if (req.path.startsWith('/auth/nonce')) {
            return next();
        }

        if ((req.path.startsWith('/auth') ||
            req.path.startsWith('/users') ||
            req.path.startsWith('/tokens')) &&
            ['POST', 'PUT', 'DELETE'].includes(req.method)) {

            return csrfProtection(req, res, next);
        }

        // Skip CSRF for WebSocket routes
        if (req.path.startsWith('/api/ws')) {
            return next();
        }

        // Skip CSRF for file upload routes
        if (req.path.startsWith('/api/upload')) {
            return next();
        }

        // Skip CSRF for Helius proxy routes
        if (req.path.startsWith('/api/helius')) {
            return next();
        }

        // All other routes skip CSRF
        next();
    });

    // Update the WebSocket route handling
    app.get('/api/ws', (req, res, next) => {
        // Only handle actual WebSocket upgrade requests
        if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
            return next();
        }

        // Let the WebSocketManager handle the upgrade
        wsManager.handleUpgrade(req, res);
    });

    // Routes
    app.use('/api', apiRouter)

    // Add API 404 handler before SPA fallback
    apiRouter.use((req, res) => {
        res.status(404).json({ error: 'API endpoint not found' });
    });

    // SPA fallback LAST
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });

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

    // Initialize cron jobs
    initializeSolPriceJob();

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

// Add a new function to start background tasks
export function startBackgroundTasks(app: Express) {
    const geckoJob = app.get('geckoJob');
    const raydiumJob = app.get('raydiumJob');
    if (geckoJob) {
        geckoJob.start();
    }
    if (raydiumJob) {
        raydiumJob.start();
    }
} 