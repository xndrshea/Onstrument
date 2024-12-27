import { createApp } from './app'
import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { HeliusManager } from './services/price/websocket/heliusManager'
import { Server } from 'http'
import WebSocket from 'ws'
import cors from 'cors'

const PORT = process.env.PORT || 3001

async function startServer() {
    try {
        logger.info('Starting server initialization...')
        await initializeDatabase()

        const app = createApp()
        const server = new Server(app)

        // Initialize WebSocket server with proper CORS
        const wss = new WebSocket.Server({
            server,
            path: '/ws',
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

        // WebSocket connection handling
        wss.on('connection', (ws, req) => {
            logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`)

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString())
                    logger.info('Received WebSocket message:', data)
                } catch (error) {
                    logger.error('Error parsing WebSocket message:', error)
                }
            })

            ws.on('error', (error) => {
                logger.error('WebSocket client error:', error)
            })
        })

        // Initialize HeliusManager
        const heliusManager = HeliusManager.getInstance()
        await heliusManager.initialize(wss)

        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`)
            logger.info(`WebSocket server running on ws://localhost:${PORT}/ws`)
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 