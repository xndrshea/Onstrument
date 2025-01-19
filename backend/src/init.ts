import { parameterStore } from './config/parameterStore';
import { logger } from './utils/logger';

export async function initializeApp(): Promise<void> {
    try {
        // Load configuration first
        await parameterStore.initialize();

        // Add any other initialization steps here

        logger.info('Application initialization complete');
    } catch (error) {
        logger.error('Failed to initialize application:', error);
        throw error;
    }
} 