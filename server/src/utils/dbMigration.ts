import { pool } from '../config/database'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger'

async function runMigration() {
    const client = await pool.connect()
    try {
        // Create schema if it doesn't exist
        await client.query('CREATE SCHEMA IF NOT EXISTS token_platform;')

        // Read and execute migration file
        const migrationPath = path.join(__dirname, '../db/migrations/002_update_token_schema.sql')
        const migrationSQL = await fs.promises.readFile(migrationPath, 'utf8')

        await client.query('BEGIN')
        await client.query(migrationSQL)
        await client.query('COMMIT')

        logger.info('Migration completed successfully')
    } catch (error) {
        await client.query('ROLLBACK')
        logger.error('Migration failed:', error)
        throw error
    } finally {
        client.release()
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('Migration completed successfully')
            process.exit(0)
        })
        .catch((error) => {
            console.error('Migration failed:', error)
            process.exit(1)
        })
}

export { runMigration } 