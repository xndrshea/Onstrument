declare global {
    var wss: WebSocket.Server;
}

import { createApp } from './app'
import { logger } from './utils/logger'
import { checkDatabaseSetup } from './config/database'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { Server } from 'http'
import WebSocket from 'ws'
import { wsManager } from './services/websocket/WebSocketManager'
import { loadConfig } from './config/parameterStore'

const PORT = process.env.PORT || 3001

async function startServer() {
    try {
        logger.info('Starting server initialization...')

        // 1. Load configuration (either from AWS or .env)
        await loadConfig()
        logger.info('Config loaded successfully')

        // 2. Check and initialize database if needed
        await checkDatabaseSetup()
        logger.info('Database setup complete')

        // 3. Create Express app
        const app = createApp()
        logger.info('Express app created')

        const server = new Server(app)
        logger.info('HTTP server created')

        // 4. Initialize WebSocket server with proper CORS
        logger.info('Setting up WebSocket server...');
        const wss = new WebSocket.Server({
            server,
            path: '/api/ws',
            verifyClient: (info, cb) => {
                const origin = info.origin || info.req.headers.origin
                logger.info(`WebSocket connection attempt from origin: ${origin}`);
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:5173',
                    process.env.FRONTEND_URL
                ].filter(Boolean)

                if (allowedOrigins.includes(origin)) {
                    cb(true)
                    logger.info('WebSocket connection accepted');
                } else {
                    logger.warn(`Rejected WebSocket connection from origin: ${origin}`)
                    cb(false, 403, 'Forbidden')
                }
            }
        })
        logger.info('WebSocket server created on path: /api/ws');

        // 5. Initialize WebSocket Manager
        wsManager.initialize(wss)
        logger.info('WebSocket Manager initialized');

        // 6. Store WSS globally for legacy compatibility
        global.wss = wss

        // 7. Initialize HeliusManager with both WSS and WebSocketManager
        const heliusManager = HeliusManager.getInstance()
        await heliusManager.initialize(wss)

        // 8. Start listening
        server.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`)
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 