import { createApp } from './app'
import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { Server } from 'http'
import WebSocket from 'ws'

const PORT = process.env.PORT || 3001

async function startServer() {
    try {
        logger.info('Starting server initialization...')

        // Initialize database first
        await initializeDatabase()
        logger.info('Database initialized successfully')

        // Create Express app and server
        const app = createApp()
        const server = new Server(app)

        // Initialize WebSocket server
        const wss = new WebSocket.Server({
            server,
            path: '/ws'
        })

        // Initialize HeliusWebSocketService
        try {
            const heliusManager = HeliusManager.getInstance()
            await heliusManager.initialize(wss)
            logger.info('HeliusWebSocketService initialized successfully')
        } catch (error) {
            logger.error('Failed to initialize HeliusWebSocketService:', error)
            throw error
        }

        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`)
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 