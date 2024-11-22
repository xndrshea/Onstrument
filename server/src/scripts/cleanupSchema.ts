import { pool } from '../config/database'
import { logger } from '../utils/logger'

async function cleanupSchema() {
    const client = await pool.connect()
    try {
        // Drop the unused schema
        await client.query('DROP SCHEMA IF EXISTS token_launchpad CASCADE;')

        // Verify only token_platform exists
        const schemas = await client.query(`
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name LIKE 'token%';
        `)

        logger.info('Remaining schemas:', schemas.rows)

    } catch (error) {
        logger.error('Error cleaning up schemas:', error)
        throw error
    } finally {
        client.release()
        process.exit(0)
    }
}

cleanupSchema() 