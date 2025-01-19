import { logger } from './utils/logger';
import { InitializationService } from './services/initialization/InitializationService';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function bootstrap() {
    try {
        logger.info('Starting application initialization...');

        const initService = InitializationService.getInstance();
        await initService.initialize(PORT);

        logger.info('Application successfully started');
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
}

bootstrap(); 
