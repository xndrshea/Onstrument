import express from 'express'
import cors from 'cors'
import { logger } from './utils/logger'
import { pool } from './config/database'
import { app } from './app'  // Import the configured app
import apiRouter from './routes/api';

const port = process.env.PORT || 3001

// Add a simple database connection check without initialization
pool.on('connect', () => {
    logger.info('Connected to existing database')
})

app.use('/api', apiRouter);

app.listen(port, () => {
    logger.info(`Server running on port ${port}`)
}) 