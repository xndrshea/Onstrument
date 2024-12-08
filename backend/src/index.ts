import { createApp } from './app'
import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { TokenSyncJob } from './jobs/tokenSync'

const PORT = process.env.PORT || 3001

// Set more conservative memory limits
const MIN_MEMORY = 512  // 512MB minimum
const MAX_MEMORY = 2048 // 2GB maximum

// Check and set memory limits
if (!process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
    const memory = Math.min(Math.max(parseInt(process.env.MEMORY_LIMIT_MB || MAX_MEMORY.toString()), MIN_MEMORY), MAX_MEMORY)
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${memory}`
}

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

        // Create the app first
        const app = createApp()

        // Start listening before initializing token sync
        const server = app.listen(PORT, () => {
            logger.info(`Server is now running and listening on port ${PORT}`)
            logger.info(`API endpoints available at http://localhost:${PORT}/api`)
        })

        // Initialize token sync job after server is listening
        logger.info('Starting token sync job...')
        const tokenSync = TokenSyncJob.getInstance()
        await tokenSync.start()
        logger.info('Token sync job started successfully')

        // Add error handling for the server
        server.on('error', (error: Error) => {
            logger.error('Server error:', error)
            process.exit(1)
        })

    } catch (error) {
        logger.error('Failed to start server:', error)
        if (error instanceof Error) {
            logger.error(error.stack)
        }
        process.exit(1)
    }
}

// Add process error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error)
    process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

startServer() 