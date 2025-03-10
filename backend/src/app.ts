import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import apiRouter from './routes/api'
import { TokenDiscoveryService } from './services/discovery/tokenDiscoveryService'
import { CronJob } from 'cron'
import { wsManager } from './services/websocket/WebSocketManager'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { parameterStore } from './config/parameterStore'
import { Express } from 'express'
import { initializeSolPriceJob } from './jobs/solPriceJob'
import csrf from 'csurf'
import cookieParser from 'cookie-parser'
import path from 'path'
import { MetricsUpdaterService } from './services/metrics/metricsUpdaterService'
import bodyParser from 'body-parser'
import multer from 'multer'

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
    //const discoveryService = TokenDiscoveryService.getInstance();

    // Run initial queries immediately
    //Promise.all([
    //    discoveryService.fetchGeckoTerminalPools(),
    //    discoveryService.fetchRaydiumPools()
    //]).catch(error => {
    //    logger.error('Error in initial token discovery:', error)
    //})

    // Set up scheduled jobs
    //const geckoJob = new CronJob(
    //    '* * * * *',
    //    async () => {
    //        try {
    //            await discoveryService.fetchGeckoTerminalPools()
    //        } catch (error) {
    //            logger.error('Error fetching GeckoTerminal pools:', error)
    //        }
    //    },
    //    null,    // onComplete
    //    true,    // start
    //    undefined, // timezone
    //    undefined, // context
    //    true     // runOnInit - This makes it run immediately
    //)

    //const raydiumJob = new CronJob(
    //    '*/5 * * * *',
    //    async () => {
    //        try {
    //            await discoveryService.fetchRaydiumPools()
    //        } catch (error) {
    //            logger.error('Error fetching Raydium pools:', error)
    //        }
    //    },
    //    null,
    //    true,
    //    undefined,
    //    undefined,
    //    true    // runOnInit
    //)

    // Don't start it yet
    //app.set('geckoJob', geckoJob)
    //app.set('raydiumJob', raydiumJob)

    // Security middleware
    app.use(helmet({
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginOpenerPolicy: false,
    }))

    // CORS setup first
    app.use(cors({
        origin: process.env.NODE_ENV === 'production'
            ? 'https://onstrument.com'
            : 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-CSRF-Token',
            'x-csrf-token', // Some frameworks send lowercase
            'solana-client',
            'x-requested-with',
            'pinata-api-key',
            'pinata-secret-api-key'
        ],
        exposedHeaders: [
            'X-CSRF-Token',
            'Set-Cookie',
            'Authorization'
        ]
    }));

    // File upload middleware needs to come before body parsers
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB limit
        }
    }).single('file');

    // Route-specific file upload handling
    app.post('/api/upload/image', (req, res, next) => {
        upload(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: 'File upload error: ' + err.message });
            } else if (err) {
                return res.status(500).json({ error: 'Unknown error: ' + err.message });
            }
            next();
        });
    });

    // Cookie parser and body parsers after file upload
    app.use(cookieParser())
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true }))

    // 3. Single CSRF middleware configuration
    const csrfProtection = csrf({
        cookie: {
            key: '_csrf',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            httpOnly: true
        }
    });

    // 4. CSRF token endpoint
    app.get('/api/csrf-token', csrfProtection, (req, res) => {
        res.json({ csrfToken: req.csrfToken() });
    });

    // Rate limiting - only apply to regular HTTP endpoints, not WebSocket
    app.use((req, res, next) => {
        // Skip rate limiting for WebSocket and health check endpoints
        if (
            req.path === '/api/ws' ||
            req.path === '/health' ||
            req.path === '/api/ws/health'
        ) {
            return next();
        }

        // Apply rate limit to all other routes
        rateLimit({
            windowMs: 1 * 60 * 1000,
            max: process.env.NODE_ENV === 'development' ? 1000 : 600,
            // Skip X-Forwarded-For validation
            validate: false
        })(req, res, next);
    });

    // 5. Apply CSRF protection to API routes
    app.use('/api', (req, res, next) => {
        // Always allow GET requests (read-only)
        if (req.method === 'GET') {
            return next();
        }

        // Exempt only essential endpoints that have their own auth
        const csrfExemptPaths = [
            '/auth/nonce',
            '/auth/verify',
            '/auth/verify-silent',
            '/auth/logout',
            '/ws',
            '/helius',
            '/upload/image',         // Changed from /upload/* to be more specific
            '/upload/metadata'       // Added specific metadata endpoint
        ];

        if (csrfExemptPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        // Apply CSRF protection to all other POST/PUT/DELETE requests
        return csrfProtection(req, res, next);
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
    // Initialize metrics updater service
    const metricsUpdater = MetricsUpdaterService.getInstance();
    metricsUpdater.start().catch(error => {
        logger.error('Failed to start metrics updater:', error);
    });

    // Cleanup on shutdown
    process.on('SIGTERM', () => {
        // Add cleanup for metrics updater
        const metricsUpdater = MetricsUpdaterService.getInstance();
        metricsUpdater.stop();
    });
}

export function startBackgroundTasks(app: Express) {
    // Remove geckoJob and raydiumJob
    // Keep other necessary background tasks
} 