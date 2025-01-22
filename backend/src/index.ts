import { logger } from './utils/logger';
import { InitializationService } from './services/initialization/InitializationService';
import { createApp } from './app';
import { ApplicationServer } from './server/Server';
import { startBackgroundTasks } from './app';
import { parameterStore } from './config/parameterStore';
import { getPool } from './config/database';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// TEST GITHUB ACTIONS DEPLOYMENT - BACKEND CHANGE - TEST 2

async function bootstrap() {
    try {

        await parameterStore.initialize();

        const dbPool = getPool();

        try {
            await dbPool.query('SELECT 1');
        } catch (dbError) {
            logger.error('Database connection test failed:', {
                error: dbError,
                config: {
                    host: process.env.DB_HOST,
                    port: process.env.DB_PORT,
                    database: process.env.DB_NAME,
                    user: process.env.DB_USER,
                    // Don't log password
                }
            });
            throw dbError;
        }

        const app = createApp();

        const server = new ApplicationServer(app, PORT);
        await server.initialize();

        startBackgroundTasks(app);

    } catch (error) {
        logger.error('❌ BOOTSTRAP: Failed to start application:', error);
        process.exit(1);
    }
}

// Add this to ensure bootstrap is called
bootstrap().catch(error => {
    logger.error('Fatal error during bootstrap:', error);
    process.exit(1);
}); 
