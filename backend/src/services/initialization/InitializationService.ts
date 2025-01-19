import { logger } from '../../utils/logger';
import { parameterStore } from '../../config/parameterStore';
import { checkDatabaseSetup } from '../../config/database';
import { createApp } from '../../app';
import { ApplicationServer } from '../../server/Server';
import { Express } from 'express';

export class InitializationService {
    private static instance: InitializationService;

    private constructor() { }

    public static getInstance(): InitializationService {
        if (!InitializationService.instance) {
            InitializationService.instance = new InitializationService();
        }
        return InitializationService.instance;
    }

    public async initialize(port: number): Promise<ApplicationServer> {
        try {
            logger.info('Starting application initialization...');

            // 1. Load configuration
            logger.info('Step 1: Loading configuration...');
            await this.initializeConfig();
            logger.info('Configuration loaded successfully');

            // 2. Create and configure Express app
            logger.info('Step 2: Creating Express application...');
            const app = await this.initializeExpress();
            logger.info('Express application created successfully');

            // 3. Create and initialize server
            logger.info('Step 3: Creating and initializing server...');
            const server = new ApplicationServer(app, port);
            await server.initialize();
            logger.info('Server initialized successfully');

            return server;
        } catch (error) {
            logger.error('Failed to initialize application:', error);
            if (error instanceof Error) {
                logger.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }

    private async initializeConfig(): Promise<void> {
        try {
            logger.info('Checking parameter store initialization...');
            if (!parameterStore.isInitialized()) {
                throw new Error('Parameter store must be initialized before configuration setup');
            }
            logger.info('Parameter store check completed');
        } catch (error) {
            logger.error('Configuration initialization failed:', error);
            throw error;
        }
    }

    private async initializeExpress(): Promise<Express> {
        try {
            logger.info('Setting up Express application...');
            const app = createApp();
            logger.info('Express application setup completed');
            return app;
        } catch (error) {
            logger.error('Express initialization failed:', error);
            throw error;
        }
    }
} 