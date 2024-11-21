import { pool } from '../config/database'
import { logger } from '../utils/logger'

async function clearDatabase() {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // Clear tables
        await client.query('TRUNCATE TABLE token_platform.token_stats CASCADE')
        await client.query('TRUNCATE TABLE token_platform.tokens CASCADE')
        await client.query('TRUNCATE TABLE token_platform.users CASCADE')

        // Reset sequences
        await client.query('ALTER SEQUENCE token_platform.tokens_id_seq RESTART WITH 1')
        await client.query('ALTER SEQUENCE token_platform.users_id_seq RESTART WITH 1')

        await client.query('COMMIT')
        logger.info('Database cleared successfully')

        // Add an API endpoint to clear frontend storage
        console.log('Remember to clear your browser\'s localStorage!')
        console.log('Run this in your browser console:')
        console.log('localStorage.removeItem("created_tokens")')

    } catch (error) {
        await client.query('ROLLBACK')
        logger.error('Error clearing database:', error)
        throw error
    } finally {
        client.release()
        await pool.end()
    }
}

// Run if called directly
if (require.main === module) {
    clearDatabase()
        .then(() => {
            console.log('Database cleared successfully')
            process.exit(0)
        })
        .catch((error) => {
            console.error('Error clearing database:', error)
            process.exit(1)
        })
} 