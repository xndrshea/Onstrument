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
            // 1. Load configuration
            await this.initializeConfig();

            // 2. Set up database
            await this.initializeDatabase();

            // 3. Create and configure Express app
            const app = await this.initializeExpress();

            // 4. Create and initialize server
            const server = new ApplicationServer(app, port);
            await server.initialize();

            return server;
        } catch (error) {
            logger.error('Failed to initialize application:', error);
            throw error;
        }
    }

    private async initializeConfig(): Promise<void> {
        logger.info('Loading configuration...');
        await parameterStore.initialize();
        logger.info('Configuration loaded successfully');
    }

    private async initializeDatabase(): Promise<void> {
        logger.info('Setting up database...');
        await checkDatabaseSetup();
        logger.info('Database setup complete');
    }

    private async initializeExpress(): Promise<Express> {
        logger.info('Creating Express application...');
        const app = createApp();
        logger.info('Express application created');
        return app;
    }
} 