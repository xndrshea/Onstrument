import { createApp } from './app'
import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { Server } from 'http'
import WebSocket from 'ws'
import cors from 'cors'

const PORT = process.env.PORT || 3001

// Set more conservative memory limits
const MIN_MEMORY = 512  // 512MB minimum
const MAX_MEMORY = 2048 // 2GB maximum

// Check and set memory limits
if (!process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
    const memory = Math.min(Math.max(parseInt(process.env.MEMORY_LIMIT_MB || MAX_MEMORY.toString()), MIN_MEMORY), MAX_MEMORY)
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${memory}`
}

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'];

async function startServer() {
    try {
        logger.info('Starting server initialization...')

        // Initialize database first
        const dbInitialized = await initializeDatabase()
        if (!dbInitialized) {
            logger.error('Database initialization failed')
            process.exit(1)
        }
        logger.info('Database initialized successfully')

        // Create Express app and server
        const app = createApp()
        const server = new Server(app)

        // Initialize WebSocket server
        const wss = new WebSocket.Server({
            server,
            path: '/ws'
        })

        // Only initialize HeliusWebSocketService after database is ready
        try {
            const heliusManager = HeliusManager.getInstance()
            await heliusManager.initialize(wss)
            logger.info('HeliusWebSocketService initialized successfully')
        } catch (error) {
            logger.error('Failed to initialize HeliusWebSocketService:', error)
            throw error
        }

        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info('Active routes:', app._router.stack
                .filter((r: any) => r.route)
                .map((r: any) => ({
                    path: r.route.path,
                    methods: Object.keys(r.route.methods)
                })));
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 