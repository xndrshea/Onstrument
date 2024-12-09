import { createApp } from './app'
import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { WebSocketService } from './services/websocketService'
import { Server } from 'http'
import WebSocket from 'ws'

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
        logger.info(`Memory limit set to: ${process.env.NODE_OPTIONS}`)

        // Initialize database
        logger.info('Initializing database...')
        const dbInitialized = await initializeDatabase()
        if (!dbInitialized) {
            throw new Error('Database initialization failed')
        }
        logger.info('Database initialized successfully')

        // Create Express app
        const app = createApp()

        // Create HTTP server
        const server = new Server(app)

        // Initialize WebSocket server with path
        const wss = new WebSocket.Server({
            server,
            path: '/ws',
            verifyClient: (info, cb) => {
                // Allow all connections in development
                const isAllowed = process.env.NODE_ENV === 'development' ||
                    !!(info.origin && allowedOrigins.includes(info.origin));
                cb(isAllowed);
            }
        })

        // Initialize WebSocket service
        const wsService = WebSocketService.getInstance()
        wsService.initialize(wss)

        // Handle WebSocket connection
        wss.on('connection', (ws, req) => {
            logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`)

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString())
                    wsService.handleMessage(data)
                } catch (error) {
                    logger.error('Error handling WebSocket message:', error)
                }
            })

            ws.on('error', (error) => {
                logger.error('WebSocket connection error:', error)
            })

            ws.on('close', () => {
                logger.info('WebSocket connection closed')
            })
        })

        logger.info('WebSocket server initialized')

        // Start server
        server.listen(PORT, () => {
            logger.info(`Server is running and listening on port ${PORT}`)
            logger.info(`API endpoints available at http://localhost:${PORT}/api`)
            logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`)
        })

        // Add error handling for the server
        server.on('error', (error: Error) => {
            logger.error('Server error:', error)
            process.exit(1)
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 