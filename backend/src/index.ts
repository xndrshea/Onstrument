import { logger } from './utils/logger';
import { InitializationService } from './services/initialization/InitializationService';
import { createApp } from './app';
import { ApplicationServer } from './server/Server';
import { startBackgroundTasks } from './app';
import { parameterStore } from './config/parameterStore';
import { getPool } from './config/database';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function bootstrap() {
    try {
        logger.info('🚀 BOOTSTRAP: Starting application initialization...');

        // Debug log for parameter store
        logger.info('Step 1: Initializing parameter store...');
        await parameterStore.initialize();
        logger.info('Parameter store initialized successfully');

        // Debug log for database connection
        logger.info('Step 2: Getting database pool...');
        const dbPool = getPool();
        logger.info('Database pool created, testing connection...');

        try {
            await dbPool.query('SELECT 1');
            logger.info('Database connection test successful');
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

        logger.info('Step 3: Creating application...');
        const app = createApp();

        logger.info('Step 4: Initializing server on port:', PORT);
        const server = new ApplicationServer(app, PORT);
        await server.initialize();

        logger.info('Step 5: Starting background tasks...');
        startBackgroundTasks(app);

        logger.info('✅ BOOTSTRAP: Application successfully started');
    } catch (error) {
        logger.error('❌ BOOTSTRAP: Failed to start application:', error);
        process.exit(1);
    }
}

// Add this to ensure bootstrap is called
logger.info('Starting bootstrap process...');
bootstrap().catch(error => {
    logger.error('Fatal error during bootstrap:', error);
    process.exit(1);
}); 
