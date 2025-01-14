declare global {
    var wss: WebSocket.Server;
}

import { createApp } from './app'
import { logger } from './utils/logger'
import { checkDatabaseSetup } from './config/database'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { Server } from 'http'
import WebSocket from 'ws'
import cors from 'cors'
import { wsManager } from './services/websocket/WebSocketManager'

const PORT = process.env.PORT || 3001

async function startServer() {
    try {
        logger.info('Starting server initialization...')

        // Check and initialize database if needed
        await checkDatabaseSetup()

        const app = createApp()
        const server = new Server(app)

        // Initialize WebSocket server with proper CORS
        const wss = new WebSocket.Server({
            server,
            path: '/api/ws',
            verifyClient: (info, cb) => {
                const origin = info.origin || info.req.headers.origin
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:5173',
                    process.env.FRONTEND_URL
                ].filter(Boolean)

                if (allowedOrigins.includes(origin)) {
                    cb(true)
                } else {
                    logger.warn(`Rejected WebSocket connection from origin: ${origin}`)
                    cb(false, 403, 'Forbidden')
                }
            }
        })

        // Initialize WebSocket Manager
        wsManager.initialize(wss)

        // Store WSS globally for legacy compatibility
        global.wss = wss

        // Initialize HeliusManager with both WSS and WebSocketManager
        const heliusManager = HeliusManager.getInstance()
        await heliusManager.initialize(wss)

        server.listen(PORT, () => {
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 