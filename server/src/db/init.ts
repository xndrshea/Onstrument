import { pool } from '../config/database'
import { logger } from '../utils/logger'

export async function initializeDatabase() {
    const client = await pool.connect()
    try {
        // Create schema if it doesn't exist
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS token_launchpad;
        `)

        // Create tokens table
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_launchpad.tokens (
                mint_address TEXT PRIMARY KEY,
                metadata JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `)

        // Verify the table exists
        const result = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'token_launchpad'
                AND table_name = 'tokens'
            );
        `)

        if (!result.rows[0].exists) {
            logger.error('Failed to create required tables in token_launchpad schema')
            throw new Error('Database tables creation failed')
        }

        logger.info('Database initialized successfully')
    } catch (error) {
        logger.error('Error initializing database:', error)
        throw error
    } finally {
        client.release()
    }
} 