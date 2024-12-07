import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { pool, initializeDatabase } from './config/database';
import apiRouter from './routes/api';
import { DexService } from './services/dexService';

const app = express();
const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        // Initialize database connection
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            throw new Error('Database initialization failed');
        }

        // Initialize DexService
        const dexService = new DexService();

        // Add cleanup on server shutdown
        process.on('SIGTERM', () => {
            dexService.cleanup();
        });

        // Middleware
        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Routes
        app.use('/api', apiRouter);

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 