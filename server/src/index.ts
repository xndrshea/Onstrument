import { app } from './app'
import { initializeDatabase } from './config/database'
import { logger } from './utils/logger'

const port = process.env.PORT || 3001

async function startServer() {
    try {
        await initializeDatabase()

        app.listen(port, () => {
            logger.info(`Server running at http://localhost:${port}`)
        })
    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer() 