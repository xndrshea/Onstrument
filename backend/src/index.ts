import { logger } from './utils/logger'
import { initializeDatabase } from './config/database'
import { app } from './app'
import apiRouter from './routes/api'
import { verifyEnvironmentVariables } from './utils/configCheck'

const port = process.env.PORT || 3001

async function startServer() {
    // Verify environment variables
    if (!verifyEnvironmentVariables()) {
        process.exit(1)
    }

    // Initialize database
    const dbConnected = await initializeDatabase()
    if (!dbConnected) {
        logger.error('Failed to initialize database')
        process.exit(1)
    }

    app.listen(port, () => {
        logger.info(`Server running on port ${port}`)
    })
}

startServer().catch((error) => {
    logger.error('Failed to start server:', error)
    process.exit(1)
}) 