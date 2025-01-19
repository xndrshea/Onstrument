import { logger } from './utils/logger';
import { InitializationService } from './services/initialization/InitializationService';
import { createApp } from './app';
import { ApplicationServer } from './server/Server';
import { startBackgroundTasks } from './app';
import { parameterStore } from './config/parameterStore';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function bootstrap() {
    try {
        logger.info('🚀 BOOTSTRAP: Starting application initialization...');

        // 1. Load env vars FIRST
        await parameterStore.initialize();
        logger.info('🔑 BOOTSTRAP: API Key Status:', process.env.HELIUS_API_KEY ? '[EXISTS]' : '[MISSING]');

        // 2. Create app and server
        const app = createApp();
        const server = new ApplicationServer(app, PORT);
        await server.initialize();

        // 3. Start background tasks AFTER everything else
        startBackgroundTasks(app);

        logger.info('✅ BOOTSTRAP: Application successfully started');
    } catch (error) {
        logger.error('❌ BOOTSTRAP: Failed to start application:', error);
        process.exit(1);
    }
}

bootstrap(); 
